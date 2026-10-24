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
