/**
 * A fetch call rejects with a `TypeError` when the browser cannot reach the
 * server at all. The wording differs between engines, so this matches each.
 */
const FETCH_NETWORK_FAILURES = [
  'failed to fetch', // Chromium
  'networkerror when attempting to fetch resource', // Firefox
  'load failed', // Safari
  'fetch failed', // undici, used server-side and in tests
]

/** Ignore recoverable disconnects, unreachable ticket requests, and lost-seat errors; report other realtime failures. */
export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnauthorizedError') return true
  if (typeof message !== 'string') return false
  if (message.includes('connection closed')) return true
  const lowered = message.toLowerCase()
  return name === 'TypeError' && FETCH_NETWORK_FAILURES.some((phrase) => lowered.includes(phrase))
}
