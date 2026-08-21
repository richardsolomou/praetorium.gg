import { useEffect, useState } from 'react'

/** How long a run of changes settles for before anything is asked of the server. */
const SETTLE_MS = 150

/**
 * The value as it stood once it stopped changing.
 *
 * Holding a stepper down is one intent, not fifteen: pricing every intermediate count
 * would send fifteen requests for a number the player was passing through. This waits
 * for the pauses instead, which is what makes the datasheet queries keyed on a whole
 * roster affordable.
 */
export function useSettled<T>(value: T, delay = SETTLE_MS): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setSettled(value), delay)
    return () => window.clearTimeout(timeout)
  }, [value, delay])
  return settled
}
