import { afterEach, describe, expect, it } from 'vitest'
import type { PraetoriumConnection } from '../db/connection'
import { openTestDatabase } from '../db/testDatabase'
import { user } from '../db/schema'
import { createAuth } from './auth'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

function cookieHeaders(headers: Headers) {
  return new Headers({
    cookie: headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
  })
}

function mergeCookieHeaders(current: Headers, response: Headers) {
  const cookies = new Map(
    (current.get('cookie') ?? '')
      .split('; ')
      .filter(Boolean)
      .map((cookie) => cookie.split(/=(.*)/s).slice(0, 2) as [string, string]),
  )
  for (const cookie of response.getSetCookie()) {
    const pair = cookie.split(';')[0]
    if (!pair) continue
    const [name, value] = pair.split(/=(.*)/s).slice(0, 2)
    if (!name || value === undefined) continue
    cookies.set(name, value)
  }
  return new Headers({ cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') })
}

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const bits = value
    .split('')
    .map((character) => alphabet.indexOf(character).toString(2).padStart(5, '0'))
    .join('')
  return Buffer.from(bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []).toString()
}

describe('account administration', () => {
  let connection: PraetoriumConnection | undefined

  afterEach(async () => {
    await connection?.close()
    connection = undefined
  })

  it('assigns one administrator across concurrent first sign-ups', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)

    await Promise.all([
      auth.api.signUpEmail({ body: { email: 'first@example.com', password: 'password1234', name: 'First' } }),
      auth.api.signUpEmail({ body: { email: 'second@example.com', password: 'password1234', name: 'Second' } }),
    ])

    const accounts = (await connection.database.select().from(user)).filter((candidate) => !candidate.email.endsWith('.invalid'))
    expect(accounts.filter((candidate) => candidate.role === 'admin')).toHaveLength(1)
  })

  it('lets an administrator impersonate a user and return to their session', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const administrator = await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: 'password1234', name: 'Admin' },
      returnHeaders: true,
    })
    const administratorHeaders = cookieHeaders(administrator.headers)
    const created = await auth.api.createUser({
      body: { email: 'player@example.com', password: 'password1234', name: 'Player', role: 'user' },
      headers: administratorHeaders,
    })

    const impersonated = await auth.api.impersonateUser({
      body: { userId: created.user.id },
      headers: administratorHeaders,
      returnHeaders: true,
    })
    const impersonatedHeaders = mergeCookieHeaders(administratorHeaders, impersonated.headers)
    expect(await auth.api.getSession({ headers: impersonatedHeaders })).toMatchObject({
      session: { impersonatedBy: administrator.response.user.id },
      user: { email: 'player@example.com', role: 'user' },
    })

    const restored = await auth.api.stopImpersonating({ headers: impersonatedHeaders, returnHeaders: true })
    expect(await auth.api.getSession({ headers: mergeCookieHeaders(impersonatedHeaders, restored.headers) })).toMatchObject({
      session: { impersonatedBy: null },
      user: { email: 'admin@example.com', role: 'admin' },
    })
  })

  it('requires an authenticator code after two-factor setup', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'secure@example.com', password: 'password1234', name: 'Secure' },
      returnHeaders: true,
    })
    const sessionHeaders = cookieHeaders(signedUp.headers)
    const enrollment = await auth.api.enableTwoFactor({
      body: { password: 'password1234' },
      headers: sessionHeaders,
      returnHeaders: true,
    })
    const secret = new URL(enrollment.response.totpURI).searchParams.get('secret')
    expect(secret).toBeTruthy()

    const generated = await auth.api.generateTOTP({ body: { secret: decodeBase32(secret!) } })
    await auth.api.verifyTOTP({
      body: { code: generated.code },
      headers: mergeCookieHeaders(sessionHeaders, enrollment.headers),
    })
    const signedIn = await auth.api.signInEmail({
      body: { email: 'secure@example.com', password: 'password1234' },
      returnHeaders: true,
    })

    expect(signedIn.response).toMatchObject({ twoFactorRedirect: true })
    expect(await auth.api.getSession({ headers: cookieHeaders(signedIn.headers) })).toBeNull()
  })
})
