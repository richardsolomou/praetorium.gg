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

/**
 * Whether a realtime failure is an ordinary disconnect rather than a fault.
 *
 * The presence poll rejects whenever the socket goes away mid-command — a
 * backgrounded tab, a network blip, a navigation, a server restart — and a token
 * refresh rejects with `UnauthorizedError` once the seat is no longer allowed.
 * Fetching a realtime ticket rejects with a `TypeError` when the browser cannot
 * reach the server, which the caller retries five seconds later. All three are
 * lifecycle events the subscription recovers from on its own, so reporting them
 * would only bury real errors as realtime use grows.
 *
 * Centrifuge rejects with a plain `{ code, message }` object for a closed
 * connection and with an `UnauthorizedError` for a lost seat, so this reads the
 * name and message off whatever shape it is handed.
 */
export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnauthorizedError') return true
  if (typeof message !== 'string') return false
  if (message.includes('connection closed')) return true
  const lowered = message.toLowerCase()
  return name === 'TypeError' && FETCH_NETWORK_FAILURES.some((phrase) => lowered.includes(phrase))
}
