/**
 * How a server function begins its refusal of a roster that cannot be fielded.
 *
 * TanStack Start flattens the thrown `Response` into a plain `Error` holding its body,
 * so the 409 status does not reach the browser. The prefix is all a browser has to
 * recognise the refusal by, so it is named once here for both sides of the wire.
 */
export const ROSTER_NOT_USABLE = 'fix roster errors before using it'

/**
 * Whether a rejection is the server refusing a roster that is over its limit or not legal.
 *
 * The refusal is an answer the player can act on, not a fault: the player sees it,
 * and error tracking keeps the failures worth reading.
 */
export function isRosterNotUsable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message.startsWith(`${ROSTER_NOT_USABLE}: `)
}
