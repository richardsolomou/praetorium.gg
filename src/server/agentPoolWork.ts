/** Agents send several heavy calls at once when comparing units or lists, so a few wait their turn before any is refused. */
const MAX_WAITING = 4

/**
 * Lets `running` pieces of work run at once and queues up to four more in arrival order; `acquire` resolves false when
 * the queue is full too, and `release` hands the slot straight to the next waiting caller.
 */
export function workSlots(running: number) {
  let active = 0
  const waiting: (() => void)[] = []
  const acquire = async () => {
    if (active < running && !waiting.length) {
      active++
      return true
    }
    if (waiting.length >= MAX_WAITING) return false
    await new Promise<void>((resolve) => waiting.push(resolve))
    return true
  }
  const release = () => {
    const next = waiting.shift()
    if (next) next()
    else active--
  }
  return { acquire, release }
}

// Anonymous agents share the calculation workers with the site's simulator and grades; this caps how many of their
// roster-wide runs hold the pool at once, so they can never fill its queue ahead of the site.
const poolSlots = workSlots(2)

/** Runs roster-wide agent work on the calculation pool, or returns null while too many already run or wait. */
export async function agentPoolWork<T>(work: () => Promise<T>): Promise<T | null> {
  if (!(await poolSlots.acquire())) return null
  try {
    return await work()
  } finally {
    poolSlots.release()
  }
}
