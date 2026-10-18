import { isGuestSeat } from '../../src/core/newBattle'

/** The parts of a connection's JWT the admission decision reads. */
export type AdmissionClaims = {
  subject: string
  issuer: string
  audience: readonly string[]
  fullPayload: Readonly<Record<string, unknown>>
}

export type Admission =
  | { kind: 'trusted' }
  | { kind: 'guest' }
  | { kind: 'player'; subject: string; userId: string; expiresAt: bigint; isAdmin: boolean }
  | { kind: 'refused' }

/**
 * Who a connecting client is: the database owner or configured operator, a guest
 * holding SpacetimeDB's own anonymous token, or a player holding a short-lived
 * access token this deployment issued. A player is an account, or a guest seat's
 * device that still holds the seat. Anything else is refused.
 */
export function admitConnection(input: {
  trusted: boolean
  senderHex: string
  jwt: AdmissionClaims | null
  issuer: string | undefined
  audience: string | undefined
  now: bigint
  maxTokenSeconds: bigint
  isRevoked: (subject: string) => boolean
  holdsGuestSeat: (seatId: string, subject: string) => boolean
}): Admission {
  const { jwt, now, maxTokenSeconds } = input
  if (input.trusted) return { kind: 'trusted' }
  if (
    jwt?.audience.length === 1 &&
    jwt.audience[0] === 'spacetimedb' &&
    jwt.fullPayload.hex_identity === input.senderHex &&
    jwt.fullPayload.userId === undefined
  )
    return { kind: 'guest' }
  if (!input.issuer || !jwt || jwt.issuer !== input.issuer || jwt.audience.length !== 1 || jwt.audience[0] !== input.audience) {
    return { kind: 'refused' }
  }
  const userId = jwt.fullPayload.userId
  const expiresAt = jwt.fullPayload.accessExpiresAt
  const tokenExpiresAt = jwt.fullPayload.exp
  const tokenType = jwt.fullPayload.tokenType
  const isAdmin = jwt.fullPayload.isAdmin
  if (
    typeof jwt.subject !== 'string' ||
    jwt.subject.length === 0 ||
    jwt.subject.length > 128 ||
    typeof userId !== 'string' ||
    userId.length === 0 ||
    userId.length > 128 ||
    typeof expiresAt !== 'number' ||
    !Number.isSafeInteger(expiresAt) ||
    typeof tokenExpiresAt !== 'number' ||
    !Number.isSafeInteger(tokenExpiresAt) ||
    tokenType !== (isGuestSeat(userId) ? 'spacetime-guest' : 'spacetime-access') ||
    (isAdmin !== undefined && (typeof isAdmin !== 'boolean' || isGuestSeat(userId))) ||
    BigInt(expiresAt) <= now ||
    BigInt(expiresAt) > now + maxTokenSeconds ||
    BigInt(tokenExpiresAt) <= now ||
    BigInt(tokenExpiresAt) > now + maxTokenSeconds ||
    input.isRevoked(jwt.subject) ||
    (isGuestSeat(userId) && !input.holdsGuestSeat(userId, jwt.subject))
  ) {
    return { kind: 'refused' }
  }
  return { kind: 'player', subject: jwt.subject, userId, expiresAt: BigInt(expiresAt), isAdmin: isAdmin === true }
}

export type AuthConfiguration = { issuer: string; audience: string; operator: string }

/**
 * The deployment's auth settings from the module environment: an HTTPS Praetorium auth issuer (or a
 * loopback one locally), the database name as audience, and the operator's identity. Anything else
 * fails closed, so no player is admitted against a malformed issuer.
 */
export function authConfiguration(env: { AUTH_ISSUER: string; AUTH_AUDIENCE: string; OPERATOR_IDENTITY: string }): AuthConfiguration {
  const { AUTH_ISSUER: issuer, AUTH_AUDIENCE: audience, OPERATOR_IDENTITY: operator } = env
  const secureIssuer = /^https:\/\/[^/?#@]+\/api\/auth(?:\/preview\/[0-9a-f]{40})?$/.test(issuer)
  const localIssuer = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\/api\/auth$/.test(issuer)
  if (
    issuer.length > 256 ||
    (!secureIssuer && !localIssuer) ||
    !/^[a-z0-9][a-z0-9-]{0,127}$/.test(audience) ||
    !/^[0-9a-f]{64}$/.test(operator)
  ) {
    throw new Error('Invalid auth configuration')
  }
  return { issuer, audience, operator }
}
