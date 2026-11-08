import { getSessionCookie } from 'better-auth/cookies'
import { constantTimeEqual, makeSignature } from 'better-auth/crypto'

/**
 * Signed-out public page renders allowed at once. Rendering is CPU work on the one request thread, so a crawler
 * asking for hundreds of distinct pages, which no edge cache holds, queues every player and the health check behind
 * it. Ordinary signed-out traffic, a couple of pages a second, rarely has more than one or two in flight.
 */
const RENDERS_AT_ONCE = 8

/**
 * Runs `render` unless the limit is reached, when it answers a 503 the crawler can retry instead.
 *
 * Only public reads without a signed session cookie come here, so players and the app's own server function calls
 * are never turned away.
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

/**
 * Whether the request carries a session cookie Better Auth signed with `secret`, checked as Better Auth's
 * `getSignedCookie` does (`<token>.<HMAC-SHA256>`) but without looking the session up, so a crawler cannot skip the
 * limit with a made-up cookie and the check costs no database read. A revoked session's cookie still passes.
 */
export async function signedSessionCookie(request: Request, secret: string) {
  const value = secret ? getSessionCookie(request) : null
  const dot = value?.lastIndexOf('.') ?? -1
  if (!value || dot < 1) return false
  return constantTimeEqual(await makeSignature(value.slice(0, dot), secret), value.slice(dot + 1))
}
