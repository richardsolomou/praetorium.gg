import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { offlineReferenceRevision } from '../../server/functions'
import { requestNativeOfflineSave, supportsNativeOffline } from '../nativeBridge'
import { referenceData } from './runtime'
import { applyReferenceData, savedReferenceData } from './referenceData'
import { downloadReference, offlineAppVersion } from './download'

const RECHECK_MS = 5 * 60_000
export function OfflineReference() {
  const client = useQueryClient()
  const lastCheck = useRef(0)
  const available = useSyncExternalStore(
    () => () => {},
    () => supportsNativeOffline() || (import.meta.env.PROD && 'serviceWorker' in navigator),
    () => false,
  )
  useEffect(() => {
    if (!available) return
    let active = true
    let controller: AbortController | null = null
    let pending = false
    const refresh = async (force = false): Promise<void> => {
      if (!active || !navigator.onLine) return
      if (controller) {
        pending ||= force
        return
      }
      if (!force && Date.now() - lastCheck.current < RECHECK_MS) return
      lastCheck.current = Date.now()
      const abort = new AbortController()
      controller = abort
      try {
        if (!referenceData() && !supportsNativeOffline()) {
          const response = await (await caches.open('praetorium-reference-v2')).match('/offline-reference.html')
          const data = response ? savedReferenceData(await response.text()) : null
          abort.signal.throwIfAborted()
          if (data) applyReferenceData(client, data)
        }
        const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15_000)])
        const [manifest, version] = await Promise.all([
          offlineReferenceRevision({ signal, fetch: (input, init) => fetch(input, { ...init, credentials: 'omit', cache: 'no-store' }) }),
          offlineAppVersion(signal),
        ])
        abort.signal.throwIfAborted()
        if (referenceData()?.revision === manifest.revision && referenceData()?.appRevision === version.revision) return
        const pack = await downloadReference(abort.signal, () => {})
        abort.signal.throwIfAborted()
        if (supportsNativeOffline()) {
          if (!(await requestNativeOfflineSave({ html: pack.html, savedAt: pack.savedAt })))
            throw new Error('Application bundle could not be saved')
        } else {
          await navigator.serviceWorker.register('/reference-worker.js')
          await navigator.serviceWorker.ready
          await (
            await caches.open('praetorium-reference-v2')
          ).put('/offline-reference.html', new Response(pack.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
        }
        abort.signal.throwIfAborted()
        applyReferenceData(client, pack.data)
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
    void refresh()
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, RECHECK_MS)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnect)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      active = false
      controller?.abort()
      clearInterval(interval)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', disconnect)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [available, client])
  return null
}
