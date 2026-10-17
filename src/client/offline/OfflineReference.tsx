import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { afterInitialScreen } from './background'
import { requestNativeOfflineSave, supportsNativeOffline } from '../nativeBridge'
import { referenceData, setPublishedReferenceRevision, warmDownloadSearch } from './runtime'
import { applyReferenceData } from './referenceData'
import { restoreReferenceInBackground } from './referenceRestoreWorker'
import { REFERENCE_CACHE, SAVED_APPLICATION } from './referenceRestore'
import {
  constructionBundle,
  constructionBundleFor,
  offlineAppVersion,
  offlineApplication,
  offlineReferenceVersion,
  referenceBundle,
} from './download'
import { rulesVersionsIn, rulesVersionsInUse } from './rulesVersionsInUse'
import { PUBLIC_REFERENCE_QUERIES } from '../../contracts/appSnapshot'
import type { OfflineReferenceVersion } from '../../contracts/offlineReference'
import { anySignal } from '../abortSignals'

const RECHECK_MS = 5 * 60_000

const usesOtherVersions = (manifest: OfflineReferenceVersion, inUse: ReadonlySet<string>) =>
  manifest.construction.versions.some((id) => inUse.has(id))
export function OfflineReference() {
  const client = useQueryClient()
  const router = useRouter()
  const lastCheck = useRef(0)
  const available = useSyncExternalStore(
    () => () => {},
    () => supportsNativeOffline() || (import.meta.env.PROD && 'serviceWorker' in navigator),
    () => false,
  )
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
        setPublishedReferenceRevision(manifest.revision)
        const held = referenceData()
        otherVersions = usesOtherVersions(manifest, rulesVersionsInUse(client))
        const constructionUrl = constructionBundleFor(manifest, otherVersions)
        if (held?.revision === manifest.revision && held.appRevision === version.revision && held.constructionBundle === constructionUrl)
          return
        if (!downloads) {
          lastCheck.current = 0
          return
        }
        const reference = await referenceBundle(manifest, abort.signal, held)
        abort.signal.throwIfAborted()
        const content = {
          version: 1 as const,
          revision: reference.revision,
          queries: reference.queries,
          search: reference.search,
          savedAt: Date.now(),
          css: '',
          logo: '',
        }
        // Pages and search answer from a new reference while its construction data downloads.
        if (held?.revision !== manifest.revision) {
          applyReferenceData(client, content)
          setPublishedReferenceRevision(manifest.revision)
          warmDownloadSearch()
        }
        const construction = await constructionBundle(constructionUrl, abort.signal, held)
        abort.signal.throwIfAborted()
        const pack = await offlineApplication({ ...content, construction, constructionBundle: constructionUrl }, version, abort.signal)
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
        }
        abort.signal.throwIfAborted()
        applyReferenceData(client, pack.data)
        setPublishedReferenceRevision(manifest.revision)
      } catch {
        // A failed background refresh leaves the last complete download in use.
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
