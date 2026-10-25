import { useEffect, useState } from 'react'

/** The longest delay a browser timer holds before it fires at once. */
const MAX_TIMER = 2 ** 31 - 1

/** The current time, read when the component mounts and again once `at` passes, so a deadline changes the page without a reload. */
export function useNow(at: number | null) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at === null || at < now) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.min(at - now + 1, MAX_TIMER))
    return () => window.clearTimeout(timer)
  }, [at, now])
  return now
}
