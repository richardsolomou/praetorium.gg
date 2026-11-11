// Anonymous agents share the calculation workers with the site's simulator and grades; this caps how many of their
// roster-wide runs hold the pool at once, so they can never fill its queue ahead of the site.
const MAX_RUNS = 2
let running = 0

/** Runs roster-wide agent work on the calculation pool, or returns null while too many already are. */
export async function agentPoolWork<T>(work: () => Promise<T>): Promise<T | null> {
  if (running >= MAX_RUNS) return null
  running++
  try {
    return await work()
  } finally {
    running--
  }
}
