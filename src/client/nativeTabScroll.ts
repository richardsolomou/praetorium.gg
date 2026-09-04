const RETRY_DELAYS = [0, 50, 250, 1_000, 3_000] as const
const INTERACTION_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const

export function restoreNativeTabScroll(scrollY: number, regions: Record<string, number>, selectors: Record<string, string>) {
  const regionTargets = Object.entries(regions).filter(([name]) => selectors[name])
  let timers: number[] = []
  let cancelled = false

  const cancel = () => {
    if (cancelled) return
    cancelled = true
    timers.forEach(window.clearTimeout)
    timers = []
    INTERACTION_EVENTS.forEach((event) => window.removeEventListener(event, cancel))
  }

  const restore = () => {
    if (cancelled) return
    if (window.scrollY !== scrollY) window.scrollTo(0, scrollY)
    for (const [name, top] of regionTargets) {
      const element = document.querySelector<HTMLElement>(selectors[name] ?? '')
      if (!element) continue
      if (element.scrollTop !== top) element.scrollTo(0, top)
    }
  }

  restore()
  INTERACTION_EVENTS.forEach((event) => window.addEventListener(event, cancel, { passive: true }))
  timers = RETRY_DELAYS.map((delay, index) =>
    window.setTimeout(() => {
      restore()
      if (index === RETRY_DELAYS.length - 1) cancel()
    }, delay),
  )
  return cancel
}
