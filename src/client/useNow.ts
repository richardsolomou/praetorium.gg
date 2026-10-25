import { useEffect, useState } from 'react'

/** The longest delay a browser timer holds before it fires at once. */
const MAX_TIMER = 2 ** 31 - 1

/** The current time, read when the component mounts and again once `at` passes, so a deadline changes the page without a reload. */
export function useNow(at: number | null | readonly (number | null)[]) {
  const [now, setNow] = useState(() => Date.now())
  const deadlines =
    typeof at === 'object' && at !== null
      ? at.filter((time): time is number => time !== null && time > now)
      : at === null || at < now
        ? []
        : [at]
  const next = deadlines.length ? Math.min(...deadlines) : null
  useEffect(() => {
    if (next === null || next < now) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, Math.min(next - Date.now() + 1, MAX_TIMER)))
    return () => window.clearTimeout(timer)
  }, [next, now])
  return now
}
