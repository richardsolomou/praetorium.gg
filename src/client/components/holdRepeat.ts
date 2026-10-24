export const HOLD_DELAY = 400
export const HOLD_INTERVAL = 80

/** Calls `step` while a press is held, until it returns false or the returned stop runs. */
export function holdRepeat(step: () => boolean): () => void {
  let interval: ReturnType<typeof setInterval> | undefined
  const stop = () => {
    clearTimeout(delay)
    clearInterval(interval)
  }
  const delay = setTimeout(() => {
    if (step()) interval = setInterval(() => step() || stop(), HOLD_INTERVAL)
  }, HOLD_DELAY)
  return stop
}

/**
 * A button press that repeats a step while held and says whether its click should still step.
 *
 * Only a pointer click from the press that already stepped is swallowed: assistive technology
 * clicks carry no detail, and the flag clears a tick after release, so neither is lost.
 */
export function holdPress() {
  let stop: (() => void) | null = null
  let listening: AbortController | null = null
  let stepped = false
  const release = () => {
    stop?.()
    stop = null
    listening?.abort()
    listening = null
    if (stepped) setTimeout(() => (stepped = false))
  }
  return {
    /** The button disables itself at its limit and then hears no pointer events, so release is heard on `events`. */
    press(pointerId: number, events: EventTarget, step: () => boolean) {
      release()
      stepped = false
      stop = holdRepeat(() => step() && (stepped = true))
      listening = new AbortController()
      const lifted = (event: Event) => (event as Event & { pointerId: number }).pointerId === pointerId && release()
      events.addEventListener('pointerup', lifted, { signal: listening.signal })
      events.addEventListener('pointercancel', lifted, { signal: listening.signal })
    },
    release,
    click(detail: number) {
      const swallowed = stepped && detail > 0
      stepped = false
      return !swallowed
    },
  }
}
