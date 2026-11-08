/**
 * Signed-out public page renders allowed at once. Rendering is CPU work on the one request thread, so a crawler
 * asking for hundreds of distinct pages, which no edge cache holds, queues every player and the health check behind
 * it. Ordinary signed-out traffic, a couple of pages a second, rarely has more than one or two in flight.
 */
const RENDERS_AT_ONCE = 8

/**
 * Runs `render` unless the limit is reached, when it answers a 503 the crawler can retry instead.
 *
 * Only signed-out public reads come here, so players with a session and the app's own server function calls are
 * never turned away.
 */
export function publicPageLoad(limit = RENDERS_AT_ONCE) {
  let running = 0
  return async <T>(render: () => T | Promise<T>): Promise<Awaited<T> | Response> => {
    if (running >= limit) return new Response('Busy', { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } })
    running += 1
    try {
      return await render()
    } finally {
      running -= 1
    }
  }
}
