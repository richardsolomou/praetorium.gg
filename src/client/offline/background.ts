import type { AnyRouter } from '@tanstack/react-router'

export function afterInitialScreen(router: Pick<AnyRouter, 'state' | 'subscribe'>, work: () => void) {
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
        if (window.requestIdleCallback) idle = window.requestIdleCallback(run, { timeout: 2_000 })
        else timer = setTimeout(run, 0)
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
