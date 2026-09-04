const RETRY_DELAYS = [50, 250, 1_000, 3_000] as const
const INTERACTION_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const

export function restoreNativeTabScroll(scrollY: number, regions: Record<string, number>, selectors: Record<string, string>) {
  let windowTarget: number | undefined = scrollY
  const regionTargets = new Map(Object.entries(regions).filter(([name]) => selectors[name]))
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
    if (windowTarget !== undefined) {
      if (window.scrollY !== windowTarget) window.scrollTo(0, windowTarget)
      if (window.scrollY === windowTarget) windowTarget = undefined
    }
    for (const [name, top] of regionTargets) {
      const element = document.querySelector<HTMLElement>(selectors[name] ?? '')
      if (!element) continue
      if (element.scrollTop !== top) element.scrollTo(0, top)
      if (element.scrollTop === top) regionTargets.delete(name)
    }
    if (windowTarget === undefined && regionTargets.size === 0) cancel()
  }

  restore()
  if (!cancelled) {
    INTERACTION_EVENTS.forEach((event) => window.addEventListener(event, cancel, { passive: true }))
    timers = RETRY_DELAYS.map((delay) => window.setTimeout(restore, delay))
  }
  return cancel
}
