/**
 * What a server function says when nobody is signed in.
 *
 * `requireUser` throws a 401 `Response` carrying this as its body, and TanStack
 * Start serializes that rejection into a plain `Error` holding the body as its
 * message — the status does not survive the trip. The message is therefore all a
 * browser has to recognise the answer by, so it is named once here rather than
 * written out on both sides of the wire.
 */
export const SIGN_IN_REQUIRED = 'sign in first'

/**
 * Whether a rejection means the player is signed out rather than that something broke.
 *
 * A lapsed session is an ordinary answer on any call with an owner, not a fault:
 * it earns the player the sign-in they need instead of an error they cannot act
 * on, and it keeps error tracking for the failures worth reading. Both shapes are
 * accepted because the same refusal is a `Response` on the server and a flattened
 * `Error` by the time it reaches the browser.
 */
export function isSignedOut(error: unknown): boolean {
  if (error instanceof Response) return error.status === 401
  if (typeof error !== 'object' || error === null) return false
  return (error as { message?: unknown }).message === SIGN_IN_REQUIRED
}
