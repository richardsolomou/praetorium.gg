import type { AnyRouter } from '@tanstack/react-router'

export function afterInitialScreen(
  router: Pick<AnyRouter, 'state' | 'subscribe'>,
  work: () => void,
  delayMs = 0,
  idleTimeout: number | null = 2_000,
) {
  let cancelled = false
  let frame = 0
  let idle = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let unsubscribe: (() => void) | undefined
  const schedule = () => {
    if (cancelled) return
    if (router.state.isLoading) {
      unsubscribe ??= router.subscribe('onResolved', () => {
        unsubscribe?.()
        unsubscribe = undefined
        schedule()
      })
      return
    }
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const run = () => {
          if (cancelled) return
          if (router.state.isLoading) schedule()
          else work()
        }
        const waitForIdle = () => {
          if (window.requestIdleCallback)
            idle = window.requestIdleCallback(run, idleTimeout === null ? undefined : { timeout: idleTimeout })
          else timer = setTimeout(run, 0)
        }
        if (delayMs) timer = setTimeout(waitForIdle, delayMs)
        else waitForIdle()
      })
    })
  }
  schedule()
  return () => {
    cancelled = true
    unsubscribe?.()
    cancelAnimationFrame(frame)
    if (idle) window.cancelIdleCallback(idle)
    clearTimeout(timer)
  }
}

type Connection = EventTarget & { effectiveType?: string; saveData?: boolean }

/** Bulk warming yields to foreground work and resumes when the browser reports a usable connection. */
export function warmOfflineFallbacks(router: Pick<AnyRouter, 'state' | 'subscribe'>, warm: () => void) {
  const connection = (navigator as Navigator & { connection?: Connection }).connection
  const usable = () => navigator.onLine && !connection?.saveData && (!connection?.effectiveType || connection.effectiveType === '4g')
  let cancel: (() => void) | undefined
  const schedule = () => {
    cancel?.()
    cancel = usable()
      ? afterInitialScreen(
          router,
          () => {
            if (!usable()) return
            stop()
            warm()
          },
          2_000,
          null,
        )
      : undefined
  }
  const stop = () => {
    cancel?.()
    window.removeEventListener('online', schedule)
    window.removeEventListener('offline', schedule)
    connection?.removeEventListener('change', schedule)
  }
  window.addEventListener('online', schedule)
  window.addEventListener('offline', schedule)
  connection?.addEventListener('change', schedule)
  schedule()
  return stop
}
