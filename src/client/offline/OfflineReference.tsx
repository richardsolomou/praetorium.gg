import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { afterInitialScreen } from './background'
import { requestNativeOfflineSave, supportsNativeOffline } from '../nativeBridge'
import { referenceData } from './runtime'
import { applyReferenceData, savedReferenceData } from './referenceData'
import { downloadReference, offlineAppVersion, offlineReferenceVersion } from './download'
import { anySignal } from '../abortSignals'

const RECHECK_MS = 5 * 60_000
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
    let ready = false
    let controller: AbortController | null = null
    let pending = false
    const refresh = async (force = false): Promise<void> => {
      if (!active || !ready || !navigator.onLine) return
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
        const signal = anySignal([abort.signal, AbortSignal.timeout(15_000)])
        const [manifest, version] = await Promise.all([offlineReferenceVersion(signal), offlineAppVersion(signal)])
        abort.signal.throwIfAborted()
        if (referenceData()?.revision === manifest.revision && referenceData()?.appRevision === version.revision) return
        const pack = await downloadReference(abort.signal, manifest, version, referenceData())
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
    const cancelInitial = afterInitialScreen(
      router,
      () => {
        ready = true
        void refresh()
      },
      10_000,
    )
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, RECHECK_MS)
    window.addEventListener('online', reconnect)
    window.addEventListener('offline', disconnect)
    document.addEventListener('visibilitychange', foreground)
    return () => {
      cancelInitial()
      active = false
      controller?.abort()
      clearInterval(interval)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('offline', disconnect)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [available, client, router])
  return null
}
