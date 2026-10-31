import { posthog } from 'posthog-js'
import { useEffect, useRef } from 'react'
import { isFetchNetworkFailure } from '../networkErrors'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { afterInitialScreen } from './background'
import { requestNativeOfflineSave, supportsNativeOffline } from '../nativeBridge'
import { offlineData, referenceData, setPublishedReference } from './runtime'
import { applyReferenceData } from './referenceData'
import { saveReference, savedReference, storePart, storesEvery } from './referenceStore'
import { offlineAppVersion, offlineApplication, offlineReferenceVersion } from './download'
import { cataloguesIn, cataloguesInUse } from './cataloguesInUse'
import { PUBLIC_REFERENCE_QUERIES } from '../../contracts/appSnapshot'
import type { OfflineReferenceData, OfflineReferenceVersion } from '../../contracts/offlineReference'
import { catalogueEditionId } from '../../core/catalogueEdition'
import { withTimeout } from '../abortSignals'
import { useClientValue } from '../useClientValue'

const RECHECK_MS = 5 * 60_000
/** Parts are small, so a few download at once to hide a phone's round trips. */
const PARALLEL_PARTS = 4

/** Rules versions besides the current rules whose construction data the device saves: every one it saved before, and those its account data names. */
function editionsFor(manifest: OfflineReferenceVersion, kept: readonly string[], catalogues: Iterable<string>) {
  const named = [...catalogues].map(catalogueEditionId).filter((id) => id !== null)
  return [...new Set([...kept, ...named])].filter((id) => Object.hasOwn(manifest.construction.editions, id)).toSorted()
}

/** Every part a download stores, the player's own factions and rules first so they are on the device soonest. */
function partsInOrder(manifest: OfflineReferenceVersion, editions: string[], catalogues: Iterable<string>) {
  const { reference, construction } = manifest
  return new Set([
    reference.core,
    ...[...catalogues].flatMap((id) => reference.parts[`faction:${id}`] ?? []),
    construction.rules,
    construction.catalogue,
    ...editions.map((id) => construction.editions[id]!),
    reference.search,
    ...Object.values(reference.parts),
  ])
}

/** Resolves once the registration's newest worker is active: an earlier release's reads only the download it saved. */
function activeWorker(registration: ServiceWorkerRegistration) {
  const incoming = registration.installing ?? registration.waiting
  if (!incoming) return navigator.serviceWorker.ready
  return new Promise<void>((resolve) => {
    const settled = () => {
      if (incoming.state === 'activated' || incoming.state === 'redundant') resolve()
    }
    incoming.addEventListener('statechange', settled)
    settled()
  })
}

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
    const requested = new Set<string>()
    const restore = async () => {
      if (offlineData()) return
      // The device's storage is the one record of what it saved. A native shell injects its saved download here, the
      // whole of it from an earlier release, which stays only until storage answers and never over one applied since.
      const injected = window.PraetoriumReferenceCache
      const data = await savedReference()
      if (!active || window.PraetoriumReferenceCache !== injected) return
      window.PraetoriumReferenceCache = undefined
      if (data) await applyReferenceData(client, data, true)
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
        const signal = withTimeout(abort.signal, 15_000)
        const [manifest, version] = await Promise.all([offlineReferenceVersion(signal), offlineAppVersion(signal)])
        abort.signal.throwIfAborted()
        published = manifest
        setPublishedReference(manifest)
        const held = referenceData()
        const catalogues = cataloguesInUse(client)
        // Another tab may have saved rules versions this one never loaded, which must stay saved.
        const stored = await savedReference()
        const editions = editionsFor(manifest, [...(held?.editions ?? []), ...(stored?.editions ?? [])], catalogues)
        if (
          held?.download.revision === manifest.revision &&
          held.appRevision === version.revision &&
          held.editions.join() === editions.join() &&
          (await storesEvery(held))
        )
          return
        if (!downloads) {
          // The download pass after the page settles checks again without waiting out the recheck interval.
          lastCheck.current = 0
          return
        }
        // Each part is stored as published, never decoded here, and one already stored is not fetched again.
        const queue = [...partsInOrder(manifest, editions, catalogues)]
        await Promise.all(
          Array.from({ length: PARALLEL_PARTS }, async () => {
            for (let asset = queue.shift(); asset; asset = queue.shift()) await storePart(asset, abort.signal)
          }),
        )
        const data: OfflineReferenceData = { version: 2, savedAt: Date.now(), appRevision: version.revision, download: manifest, editions }
        const html = await offlineApplication(data, version, abort.signal, location.origin)
        abort.signal.throwIfAborted()
        if (supportsNativeOffline()) {
          if (!(await requestNativeOfflineSave({ html, savedAt: data.savedAt }))) throw new Error('Application bundle could not be saved')
        } else {
          await activeWorker(await navigator.serviceWorker.register('/reference-worker.js'))
          // Browsers may evict an unvisited site's storage; an installed app asks to keep it. Only installed, because Firefox prompts.
          if (matchMedia('(display-mode: standalone)').matches) void navigator.storage?.persist?.().catch(() => false)
        }
        abort.signal.throwIfAborted()
        await saveReference(data, supportsNativeOffline() ? null : html)
        await applyReferenceData(client, data)
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
        // Stops the other download loops once one part fails, so a retry never fetches the same parts alongside them.
        abort.abort()
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
      if (event.type !== 'updated' || event.action.type !== 'success' || !published) return
      if (PUBLIC_REFERENCE_QUERIES.has(String(event.query.queryKey[0]))) return
      const held = new Set(referenceData()?.editions)
      const wanted = editionsFor(published, [], cataloguesIn(event.query.state.data)).filter((id) => !held.has(id) && !requested.has(id))
      if (!wanted.length) return
      for (const id of wanted) requested.add(id)
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
