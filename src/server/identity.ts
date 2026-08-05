import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const PLAYER_COOKIE = 'praetorium_player'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/**
 * The instance's signing key. Set `AUTH_SECRET` to manage it elsewhere;
 * otherwise it is generated once beside the database, because losing it signs
 * every guest out and would hand their battles to nobody.
 */
export function sessionSecret(directory: string) {
  const configured = process.env.AUTH_SECRET?.trim()
  if (configured) return configured
  const file = path.join(directory, 'session.secret')
  const generated = crypto.randomBytes(32).toString('base64url')
  try {
    fs.writeFileSync(file, generated, { mode: 0o600, flag: 'wx' })
    return generated
  } catch {
    return fs.readFileSync(file, 'utf8').trim()
  }
}

/** `<id>.<signature>`, so a guest identity cannot be forged without the secret. */
export function signPlayerId(id: string, secret: string) {
  return `${id}.${crypto.createHmac('sha256', secret).update(id).digest('base64url')}`
}

/** The id a cookie proves, or null for anything unsigned, tampered with, or absent. */
export function verifyPlayerCookie(value: string | undefined, secret: string): string | null {
  if (!value) return null
  const separator = value.lastIndexOf('.')
  if (separator < 1) return null
  const expected = Buffer.from(signPlayerId(value.slice(0, separator), secret))
  const offered = Buffer.from(value)
  if (offered.length !== expected.length || !crypto.timingSafeEqual(offered, expected)) return null
  return value.slice(0, separator)
}

/**
 * Reads the identity out of a request's own headers rather than ambient request
 * state, so a route handler and a server function can share one code path.
 */
export function playerIdFrom(headers: Headers, secret: string): string | null {
  const cookie = headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PLAYER_COOKIE}=`))
  return verifyPlayerCookie(cookie && decodeURIComponent(cookie.slice(PLAYER_COOKIE.length + 1)), secret)
}

/**
 * Who the request is, account first.
 *
 * An account that has claimed a guest identity *is* that identity, so everything
 * downstream — battles, saved lists, the command log — keeps working unchanged.
 */
export function playerFor(
  headers: Headers,
  secret: string,
  session: { userId: string; name: string } | null,
  claim: (userId: string, guestId: string | null, name: string) => string,
): string | null {
  const guest = playerIdFrom(headers, secret)
  return session ? claim(session.userId, guest, session.name) : guest
}

export function cookieOptions(headers: Headers) {
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const secure = forwarded === 'https' || process.env.APP_URL?.startsWith('https://') === true
  return { httpOnly: true, sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE_SECONDS, secure } as const
}
