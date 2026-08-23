/**
 * Whether a realtime failure is an ordinary disconnect rather than a fault.
 *
 * The presence poll rejects whenever the socket goes away mid-command — a
 * backgrounded tab, a network blip, a navigation, a server restart — and a token
 * refresh rejects with `UnauthorizedError` once the seat is no longer allowed.
 * Both are lifecycle events the subscription recovers from on its own, so
 * reporting them would only bury real errors as realtime use grows.
 *
 * Centrifuge rejects with a plain `{ code, message }` object for a closed
 * connection and with an `UnauthorizedError` for a lost seat, so this reads the
 * name and message off whatever shape it is handed.
 */
export function isExpectedRealtimeDisconnect(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'UnauthorizedError') return true
  return typeof message === 'string' && message.includes('connection closed')
}
