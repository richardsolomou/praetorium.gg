import { posthog } from 'posthog-js'
import { useEffect, useRef } from 'react'
import { isFetchNetworkFailure } from '../networkErrors'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { afterInitialScreen } from './background'
import { requestNativeOfflineSave, supportsNativeOffline } from '../nativeBridge'
import { referenceData, setPublishedReference, warmDownloadSearch } from './runtime'
import { packedConstructionOf, withConstructionOf } from './compressedReference'
import { applyReferenceData } from './referenceData'
import { restoreReferenceInBackground } from './referenceRestoreWorker'
import { REFERENCE_CACHE, SAVED_APPLICATION } from './referenceRestore'
import { constructionBundleFor, offlineAppVersion, offlineReferenceVersion } from './download'
import { partsOf } from './referenceDownload'
import { downloadInBackground } from './referenceDownloadWorker'
import { rulesVersionsIn, rulesVersionsInUse } from './rulesVersionsInUse'
import { PUBLIC_REFERENCE_QUERIES } from '../../contracts/appSnapshot'
import type { OfflineReferenceVersion } from '../../contracts/offlineReference'
import { anySignal } from '../abortSignals'
import { useClientValue } from '../useClientValue'

const RECHECK_MS = 5 * 60_000

const usesOtherVersions = (manifest: OfflineReferenceVersion, inUse: ReadonlySet<string>) =>
  manifest.construction.versions.some((id) => inUse.has(id))
export function OfflineReference() {
  const client = useQueryClient()
  const router = useRouter()
  const lastCheck = useRef(0)
  const available = useClientValue(() => supportsNativeOffline() || (import.meta.env.PROD && 'serviceWorker' in navigator), false)
  useEffect(() => {
    if (!available) return
    let active = true
    let started = false
    let downloads = false
    let controller: AbortController | null = null
    let pending = false
    let published: OfflineReferenceVersion | null = null
    let otherVersions = false
    const restore = async () => {
      if (referenceData() || (supportsNativeOffline() && !window.PraetoriumReferenceCache)) return
      const data = await restoreReferenceInBackground(window.PraetoriumReferenceCache)
      if (!data || !active || referenceData()) return
      applyReferenceData(client, data, true)
      warmDownloadSearch()
    }
    const refresh = async (force = false): Promise<void> => {
      if (!active || !started || !navigator.onLine) return
      if (controller) {
        pending ||= force
        return
      }
      if (!force && Date.now() - lastCheck.current < RECHECK_MS) return
      lastCheck.current = Date.now()
      const abort = new AbortController()
      controller = abort
      try {
        const signal = anySignal([abort.signal, AbortSignal.timeout(15_000)])
        const [manifest, version] = await Promise.all([offlineReferenceVersion(signal), offlineAppVersion(signal)])
        abort.signal.throwIfAborted()
        published = manifest
        setPublishedReference(manifest)
        const held = referenceData()
        // Every rules version stays once needed: account data naming one can leave the query cache.
        otherVersions ||= held?.allRulesVersions === true || usesOtherVersions(manifest, rulesVersionsInUse(client))
        const constructionUrl = constructionBundleFor(manifest, otherVersions)
        if (held?.revision === manifest.revision && held.appRevision === version.revision && held.constructionBundle === constructionUrl)
          return
        if (!downloads) {
          // The download pass after the page settles checks again without waiting out the recheck interval.
          lastCheck.current = 0
          return
        }
        const pack = await downloadInBackground(
          {
            manifest,
            version,
            constructionUrl,
            allRulesVersions: otherVersions,
            held: held
              ? {
                  revision: held.revision,
                  ...(held.revision === manifest.revision ? { parts: partsOf(held) } : {}),
                  construction: held.constructionBundle === constructionUrl ? (packedConstructionOf(held) ?? held.construction) : undefined,
                }
              : null,
            origin: location.origin,
          },
          abort.signal,
          // Pages and search answer from a new reference while its construction data downloads. The held construction
          // data stays for offline use meanwhile; the device answers from it only while the service still publishes it.
          (reference) => {
            applyReferenceData(
              client,
              held ? withConstructionOf({ ...reference, constructionBundle: held.constructionBundle }, held) : reference,
            )
            warmDownloadSearch()
          },
        )
        abort.signal.throwIfAborted()
        if (supportsNativeOffline()) {
          if (!(await requestNativeOfflineSave({ html: pack.html, savedAt: pack.savedAt })))
            throw new Error('Application bundle could not be saved')
        } else {
          await navigator.serviceWorker.register('/reference-worker.js')
          await navigator.serviceWorker.ready
          await (
            await caches.open(REFERENCE_CACHE)
          ).put(SAVED_APPLICATION, new Response(pack.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
          // Browsers may evict an unvisited site's storage; an installed app asks to keep it. Only installed, because Firefox prompts.
          if (matchMedia('(display-mode: standalone)').matches) void navigator.storage?.persist?.().catch(() => false)
        }
        abort.signal.throwIfAborted()
        applyReferenceData(client, pack.data)
      } catch (error) {
        // A failed background refresh leaves the last complete download in use.
        if (!abort.signal.aborted)
          posthog.capture('offline_reference_refresh_failed', {
            reason: isFetchNetworkFailure(error)
              ? 'network'
              : error instanceof DOMException && error.name === 'TimeoutError'
                ? 'timeout'
                : 'error',
          })
      } finally {
        controller = null
        if (pending) {
          pending = false
          void refresh(true)
        }
      }
    }
    const reconnect = () => void refresh(true)
    const foreground = () => {
      if (document.visibilityState === 'visible') void refresh(true)
    }
    const disconnect = () => controller?.abort()
    // Restoring the saved download and checking it is still published are local or tiny, so they follow the
    // first paint; a new download waits until the page has settled.
    const cancelStart = afterInitialScreen(router, () => {
      started = true
      void restore()
        .catch(() => {})
        .then(() => refresh())
    })
    const cancelDownloads = afterInitialScreen(
      router,
      () => {
        downloads = true
        void refresh()
      },
      10_000,
    )
    // Account data loaded later can name another rules version, whose construction data must be saved before going offline.
    const unsubscribe = client.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success' || !published || otherVersions) return
      if (PUBLIC_REFERENCE_QUERIES.has(String(event.query.queryKey[0]))) return
      if (!usesOtherVersions(published, rulesVersionsIn(event.query.state.data))) return
      otherVersions = true
      void refresh(true)
    })
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, RECHECK_MS)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnect)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      cancelStart()
      cancelDownloads()
      active = false
      controller?.abort()
      unsubscribe()
      clearInterval(interval)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', disconnect)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [available, client, router])
  return null
}
