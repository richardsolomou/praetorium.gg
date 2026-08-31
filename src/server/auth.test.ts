import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setTokenUtil } from 'better-auth/oauth2'
import type { EmailDelivery, EmailMessage } from 'ras-stack/email'
import type { PraetoriumConnection } from '../db/connection'
import { account, battles, battleUsers, commands, session, user, verification } from '../db/schema'
import { openTestDatabase } from '../db/testDatabase'
import { createAuth } from './auth'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
const S3_PUBLIC_BASE_URL = 'https://s3.praetorium.gg/praetorium'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const NATIVE_VERIFIER = 'v'.repeat(43)
const NATIVE_CHALLENGE = createHash('sha256').update(NATIVE_VERIFIER).digest('base64url')

const { configuredObjectStore, putIfAbsent } = vi.hoisted(() => ({
  configuredObjectStore: vi.fn(),
  putIfAbsent: vi.fn(async () => undefined),
}))

vi.mock('./objectStorage', () => ({
  configuredObjectStore,
  putIfAbsent,
  s3PublicBaseUrl: () => 'https://s3.praetorium.gg/praetorium',
}))

function base64url(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function googleIdToken(claims: Record<string, unknown>) {
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(claims)}.signature`
}

function mockGoogleCallback(idToken: string, avatarUrl: string, avatarBytes: Buffer) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
      if (url === GOOGLE_TOKEN_ENDPOINT) {
        return new Response(
          JSON.stringify({
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            id_token: idToken,
            token_type: 'Bearer',
            expires_in: 3600,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url === avatarUrl) return new Response(new Uint8Array(avatarBytes), { status: 200, headers: { 'content-type': 'image/png' } })
      throw new Error(`unexpected fetch to ${url}`)
    }),
  )
}

async function signInWithGoogleCallback(auth: ReturnType<typeof createAuth>) {
  const started = await auth.api.signInSocial({ body: { provider: 'google', callbackURL: '/' }, returnHeaders: true })
  const state = new URL(started.response.url!).searchParams.get('state')!
  return auth.handler(
    new Request(`http://localhost/api/auth/callback/google?code=test-code&state=${state}`, { headers: cookieHeaders(started.headers) }),
  )
}

function recordingEmail(messages: EmailMessage[]): EmailDelivery {
  return {
    send: async (message) => {
      messages.push(message)
    },
    verify: async () => undefined,
  }
}

function emailLink(message: EmailMessage) {
  const match = message.text.match(/(?:https?:\/\/|\/)\S+/)
  if (!match) throw new Error('email did not contain a link')
  return new URL(match[0], 'http://localhost')
}

function memoryStorage(): NonNullable<Parameters<typeof createAuth>[2]> {
  const values = new Map<string, string>()
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value)
      return 'OK'
    },
    delete: async (key) => {
      values.delete(key)
    },
    getAndDelete: async (key) => {
      const value = values.get(key) ?? null
      values.delete(key)
      return value
    },
    increment: async (key) => {
      const value = Number(values.get(key) ?? 0) + 1
      values.set(key, String(value))
      return value
    },
  }
}

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
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('encrypts social sign-in tokens', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)

    expect((await auth.$context).options.account).toEqual({
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: ['apple', 'google', 'discord'] },
    })
  })

  it('allows the OAuth state cookie on cross-site provider callbacks', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('APP_URL', 'https://praetorium.gg')
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret')
    const auth = createAuth(connection.database, SECRET)

    const started = await auth.api.signInSocial({ body: { provider: 'google', callbackURL: '/' }, returnHeaders: true })

    expect(started.headers.getSetCookie().find((cookie) => cookie.startsWith('__Secure-better-auth.state='))).toContain('SameSite=None')
  })

  it('exchanges a hashed one-time token into a WebView session once', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'native@example.com', password: 'password1234', name: 'Native' },
      returnHeaders: true,
    })
    const generated = await auth.api.generateOneTimeToken({ headers: cookieHeaders(signedUp.headers) })

    const [stored] = await connection.database.select().from(verification)
    expect(stored?.identifier).toMatch(/^one-time-token:/)
    expect(stored?.identifier).not.toContain(generated.token)

    const exchanged = await auth.api.verifyOneTimeToken({ body: { token: generated.token }, returnHeaders: true })
    expect(await auth.api.getSession({ headers: cookieHeaders(exchanged.headers) })).toMatchObject({
      user: { id: signedUp.response.user.id },
    })
    await expect(auth.api.verifyOneTimeToken({ body: { token: generated.token } })).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })

  it('retries one native exchange into the same authoritative session until acknowledgement', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'native-retry@example.com', password: 'password1234', name: 'Native retry' },
      returnHeaders: true,
    })
    const unrelated = await auth.api.signUpEmail({
      body: { email: 'unrelated@example.com', password: 'password1234', name: 'Unrelated' },
      returnHeaders: true,
    })
    await connection.database.insert(account).values({
      id: 'native-google',
      accountId: 'native-google',
      issuer: 'google',
      providerId: 'google',
      userId: signedUp.response.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const exchange = await auth.api.generateNativeAuthToken({
      body: { action: 'sign-in', challenge: NATIVE_CHALLENGE, provider: 'google', next: '/rosters' },
      headers: cookieHeaders(signedUp.headers),
    })

    const [stored] = await connection.database.select().from(verification)
    expect(stored?.identifier).toMatch(/^native-auth:/)
    expect(stored?.identifier).not.toContain(exchange.token)
    expect(JSON.parse(stored!.value)).toMatchObject({
      action: 'sign-in',
      challenge: NATIVE_CHALLENGE,
      next: '/rosters',
      provider: 'google',
      userId: signedUp.response.user.id,
    })

    await expect(auth.api.exchangeNativeAuthToken({ body: { ...exchange, verifier: 'w'.repeat(43) } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
    })

    const first = await auth.api.exchangeNativeAuthToken({
      body: { ...exchange, verifier: NATIVE_VERIFIER },
      headers: cookieHeaders(unrelated.headers),
      returnHeaders: true,
    })
    const retried = await auth.api.exchangeNativeAuthToken({ body: { ...exchange, verifier: NATIVE_VERIFIER }, returnHeaders: true })
    const parallel = await Promise.all(
      Array.from({ length: 3 }, () =>
        auth.api.exchangeNativeAuthToken({
          body: { ...exchange, verifier: NATIVE_VERIFIER },
          headers: cookieHeaders(unrelated.headers),
          returnHeaders: true,
        }),
      ),
    )

    expect(first.response).toEqual({ id: exchange.id, action: 'sign-in', provider: 'google', next: '/rosters' })
    expect(await auth.api.getSession({ headers: cookieHeaders(first.headers) })).toMatchObject({ user: { id: signedUp.response.user.id } })
    expect(await auth.api.getSession({ headers: cookieHeaders(retried.headers) })).toMatchObject({
      user: { id: signedUp.response.user.id },
    })
    await Promise.all(
      parallel.map(async (result) => {
        expect(await auth.api.getSession({ headers: cookieHeaders(result.headers) })).toMatchObject({
          user: { id: signedUp.response.user.id },
        })
      }),
    )

    const afterNativeSuccess = await auth.api.exchangeNativeAuthToken({
      body: { ...exchange, verifier: NATIVE_VERIFIER },
      returnHeaders: true,
    })
    expect(await auth.api.getSession({ headers: cookieHeaders(afterNativeSuccess.headers) })).toMatchObject({
      user: { id: signedUp.response.user.id },
    })

    await expect(auth.api.consumeNativeAuthToken({ body: { ...exchange, verifier: 'w'.repeat(43) } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
    })
    await auth.api.consumeNativeAuthToken({ body: { ...exchange, verifier: NATIVE_VERIFIER } })
    await expect(
      auth.api.exchangeNativeAuthToken({
        body: { ...exchange, verifier: NATIVE_VERIFIER },
        headers: cookieHeaders(unrelated.headers),
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })

  it('rejects unbound metadata and a revoked authoritative identity', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'native-bound@example.com', password: 'password1234', name: 'Native bound' },
      returnHeaders: true,
    })
    const unrelated = await auth.api.signUpEmail({
      body: { email: 'native-live@example.com', password: 'password1234', name: 'Native live' },
      returnHeaders: true,
    })
    await connection.database.insert(account).values({
      id: 'bound-google',
      accountId: 'bound-google',
      issuer: 'google',
      providerId: 'google',
      userId: signedUp.response.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await expect(
      auth.api.generateNativeAuthToken({
        body: { action: 'sign-in', challenge: NATIVE_CHALLENGE, provider: 'discord', next: '/rosters' },
        headers: cookieHeaders(signedUp.headers),
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
    await expect(
      auth.api.generateNativeAuthToken({
        body: { action: 'sign-in', challenge: NATIVE_CHALLENGE, provider: 'google', next: '/\\example.com' },
        headers: cookieHeaders(signedUp.headers),
      }),
    ).rejects.toBeTruthy()

    const exchange = await auth.api.generateNativeAuthToken({
      body: { action: 'sign-in', challenge: NATIVE_CHALLENGE, provider: 'google', next: '/rosters' },
      headers: cookieHeaders(signedUp.headers),
    })
    await connection.database.delete(account).where(eq(account.id, 'bound-google'))
    await expect(
      auth.api.exchangeNativeAuthToken({
        body: { ...exchange, verifier: NATIVE_VERIFIER },
        headers: cookieHeaders(unrelated.headers),
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
    await connection.database.insert(account).values({
      id: 'restored-google',
      accountId: 'restored-google',
      issuer: 'google',
      providerId: 'google',
      userId: signedUp.response.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await connection.database.delete(session).where(eq(session.userId, signedUp.response.user.id))

    await expect(
      auth.api.exchangeNativeAuthToken({
        body: { ...exchange, verifier: NATIVE_VERIFIER },
        headers: cookieHeaders(unrelated.headers),
      }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })

  it('rejects an expired native exchange without setting a session', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'native-expired@example.com', password: 'password1234', name: 'Native expired' },
      returnHeaders: true,
    })
    await connection.database.insert(account).values({
      id: 'expired-google',
      accountId: 'expired-google',
      issuer: 'google',
      providerId: 'google',
      userId: signedUp.response.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const exchange = await auth.api.generateNativeAuthToken({
      body: { action: 'sign-in', challenge: NATIVE_CHALLENGE, provider: 'google', next: '/rosters' },
      headers: cookieHeaders(signedUp.headers),
    })
    const [stored] = await connection.database.select().from(verification)
    await connection.database
      .update(verification)
      .set({ expiresAt: new Date(0) })
      .where(eq(verification.id, stored!.id))

    await expect(auth.api.exchangeNativeAuthToken({ body: { ...exchange, verifier: NATIVE_VERIFIER } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
    })
  })

  it('deletes the account and every battle whose log names it', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const deleting = await auth.api.signUpEmail({
      body: { email: 'deleting@example.com', password: 'password1234', name: 'Deleting' },
      returnHeaders: true,
    })
    const remaining = await auth.api.signUpEmail({
      body: { email: 'remaining@example.com', password: 'password1234', name: 'Remaining' },
    })
    await connection.database.insert(battles).values({ id: 'shared-battle', token: 'shared-token', createdAt: 1 })
    await connection.database.insert(battleUsers).values([
      { battleId: 'shared-battle', userId: deleting.response.user.id, side: 0, joinedAt: 1 },
      { battleId: 'shared-battle', userId: remaining.user.id, side: 1, joinedAt: 1 },
    ])
    await connection.database.insert(commands).values({
      battleId: 'shared-battle',
      seq: 1,
      userId: deleting.response.user.id,
      at: 1,
      body: '{}',
    })

    await auth.api.deleteUser({ body: { password: 'password1234' }, headers: cookieHeaders(deleting.headers) })

    expect(await connection.database.select().from(battles)).toEqual([])
    expect(await connection.database.select({ id: user.id }).from(user).where(eq(user.id, deleting.response.user.id))).toEqual([])
    expect(await connection.database.select({ id: user.id }).from(user).where(eq(user.id, remaining.user.id))).toHaveLength(1)
  })

  it('revokes Apple access before deleting an account', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('APPLE_CLIENT_ID', 'gg.praetorium.web')
    vi.stubEnv('APPLE_CLIENT_SECRET', 'apple-client-secret')
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'apple-delete@example.com', password: 'password1234', name: 'Apple delete' },
      returnHeaders: true,
    })
    const context = await auth.$context
    await connection.database.insert(account).values({
      id: 'apple-delete',
      accountId: 'apple-subject',
      issuer: 'https://appleid.apple.com',
      providerId: 'apple',
      userId: signedUp.response.user.id,
      refreshToken: await setTokenUtil('apple-refresh-token', context as never),
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    await auth.api.deleteUser({ body: { password: 'password1234' }, headers: cookieHeaders(signedUp.headers) })

    expect(fetcher).toHaveBeenCalledOnce()
    const request = fetcher.mock.calls[0]!
    expect(request[0]).toBe('https://appleid.apple.com/auth/revoke')
    expect(request[1]?.body).toEqual(
      new URLSearchParams({
        client_id: 'gg.praetorium.web',
        client_secret: 'apple-client-secret',
        token: 'apple-refresh-token',
        token_type_hint: 'refresh_token',
      }),
    )
  })

  it('deletes account data after an Apple account-ended notification', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'apple-ended@example.com', password: 'password1234', name: 'Apple ended' },
    })
    await connection.database.insert(account).values({
      id: 'apple-ended',
      accountId: 'ended-subject',
      issuer: 'https://appleid.apple.com',
      providerId: 'apple',
      userId: signedUp.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await connection.database.insert(battles).values({ id: 'ended-battle', token: 'ended-token', createdAt: 1 })
    await connection.database.insert(battleUsers).values({ battleId: 'ended-battle', userId: signedUp.user.id, side: 0, joinedAt: 1 })

    await auth.deleteAppleAccount('ended-subject')

    expect(await connection.database.select().from(battles)).toEqual([])
    expect(await connection.database.select().from(user).where(eq(user.id, signedUp.user.id))).toEqual([])
  })

  it.each(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])('rejects partial Google credentials missing %s', async (missing) => {
    connection = await openTestDatabase()
    vi.stubEnv('GOOGLE_CLIENT_ID', missing === 'GOOGLE_CLIENT_ID' ? '' : 'client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', missing === 'GOOGLE_CLIENT_SECRET' ? '' : 'client-secret')

    expect(() => createAuth(connection!.database, SECRET)).toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together')
  })

  it('verifies a password account through the emailed link', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('APP_URL', 'http://localhost')
    const messages: EmailMessage[] = []
    const auth = createAuth(connection.database, SECRET, undefined, recordingEmail(messages))

    const signedUp = await auth.api.signUpEmail({
      body: { email: 'player@example.com', password: 'password1234', name: 'Player', callbackURL: '/profile' },
    })

    expect(messages).toEqual([
      expect.objectContaining({
        to: 'player@example.com',
        subject: 'Verify your Praetorium email address',
        text: expect.stringContaining('/verify-email?token='),
      }),
    ])
    const link = emailLink(messages[0]!)
    const invalidLink = new URL(link)
    invalidLink.searchParams.set('token', 'invalid')
    const invalid = await auth.handler(new Request(invalidLink))
    expect(new URL(invalid.headers.get('location')!, link).searchParams.get('error')).toBe('INVALID_TOKEN')

    const verified = await auth.handler(new Request(link))
    expect(new URL(verified.headers.get('location')!, link).pathname).toBe('/profile')

    const [stored] = await connection.database.select({ emailVerified: user.emailVerified }).from(user).where(eq(user.id, signedUp.user.id))
    expect(stored?.emailVerified).toBe(true)
  })

  it('resets the password once and revokes secondary-storage sessions', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('APP_URL', 'http://localhost')
    const messages: EmailMessage[] = []
    const auth = createAuth(connection.database, SECRET, memoryStorage(), recordingEmail(messages))
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'player@example.com', password: 'password1234', name: 'Player' },
      returnHeaders: true,
    })
    messages.length = 0

    await auth.api.requestPasswordReset({
      body: { email: 'player@example.com', redirectTo: '/reset-password?next=%2Fbattles%2F123%3Fseat%3D456' },
    })

    expect(messages).toEqual([
      expect.objectContaining({
        to: 'player@example.com',
        subject: 'Reset your Praetorium password',
        text: expect.stringContaining('/reset-password/'),
      }),
    ])
    const link = emailLink(messages[0]!)
    const callback = await auth.handler(new Request(link))
    const callbackTarget = new URL(callback.headers.get('location')!, link)
    expect(callbackTarget.pathname).toBe('/reset-password')
    expect(callbackTarget.searchParams.get('next')).toBe('/battles/123?seat=456')
    const token = callbackTarget.searchParams.get('token')!
    await expect(auth.api.resetPassword({ body: { newPassword: 'replacement1234', token } })).resolves.toEqual({ status: true })
    expect(await auth.api.getSession({ headers: cookieHeaders(signedUp.headers) })).toBeNull()
    await expect(auth.api.resetPassword({ body: { newPassword: 'another-password', token } })).rejects.toMatchObject({
      status: 'BAD_REQUEST',
    })
    const expired = await auth.handler(new Request(link))
    expect(new URL(expired.headers.get('location')!, link).searchParams.get('error')).toBe('INVALID_TOKEN')
    await expect(auth.api.signInEmail({ body: { email: 'player@example.com', password: 'replacement1234' } })).resolves.toMatchObject({
      user: { email: 'player@example.com' },
    })
  })

  it('returns the initial administrator role from secondary session storage immediately', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET, memoryStorage())

    const signedUp = await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: 'password1234', name: 'Admin' },
      returnHeaders: true,
    })

    expect(await auth.api.getSession({ headers: cookieHeaders(signedUp.headers) })).toMatchObject({ user: { role: 'admin' } })
  })

  it('refreshes active secondary-storage sessions after a role change', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET, memoryStorage())
    const administrator = await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: 'password1234', name: 'Admin' },
    })
    const player = await auth.api.signUpEmail({
      body: { email: 'player@example.com', password: 'password1234', name: 'Player' },
      returnHeaders: true,
    })
    const playerHeaders = cookieHeaders(player.headers)

    expect(await auth.changeUserRole(administrator.user.id, player.response.user.id, 'admin')).toBe('changed')
    expect(await auth.changeUserRole(administrator.user.id, player.response.user.id, 'user')).toBe('changed')

    expect(await auth.api.getSession({ headers: playerHeaders })).toMatchObject({ user: { role: 'user' } })
  })

  it('rejects self-demotion and direct administrator role updates', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const administrator = await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: 'password1234', name: 'Admin' },
      returnHeaders: true,
    })
    const headers = cookieHeaders(administrator.headers)

    expect(await auth.changeUserRole(administrator.response.user.id, administrator.response.user.id, 'user')).toBe('self')
    const direct = await auth.handler(
      new Request('http://localhost/api/auth/admin/update-user', {
        method: 'POST',
        headers: { ...Object.fromEntries(headers), 'content-type': 'application/json' },
        body: JSON.stringify({ userId: administrator.response.user.id, data: { role: 'user' } }),
      }),
    )
    expect(direct.status).toBe(404)
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
    await expect(
      auth.api.setUserPassword({ body: { userId: created.user.id, newPassword: 'replacement1234' }, headers: impersonatedHeaders }),
    ).rejects.toMatchObject({ status: 'FORBIDDEN' })

    const restored = await auth.api.stopImpersonating({ headers: impersonatedHeaders, returnHeaders: true })
    expect(await auth.api.getSession({ headers: mergeCookieHeaders(impersonatedHeaders, restored.headers) })).toMatchObject({
      session: { impersonatedBy: null },
      user: { email: 'admin@example.com', role: 'admin' },
    })
  })

  it('does not impersonate another administrator', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const administrator = await auth.api.signUpEmail({
      body: { email: 'admin@example.com', password: 'password1234', name: 'Admin' },
      returnHeaders: true,
    })
    const second = await auth.api.createUser({
      body: { email: 'second@example.com', password: 'password1234', name: 'Second', role: 'user' },
      headers: cookieHeaders(administrator.headers),
    })
    expect(await auth.changeUserRole(administrator.response.user.id, second.user.id, 'admin')).toBe('changed')

    await expect(
      auth.api.impersonateUser({ body: { userId: second.user.id }, headers: cookieHeaders(administrator.headers) }),
    ).rejects.toMatchObject({ status: 'FORBIDDEN' })
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
      body: { password: 'password1234', method: 'totp' },
      headers: sessionHeaders,
      returnHeaders: true,
    })
    if (enrollment.response.method !== 'totp') throw new Error('Expected TOTP enrollment')
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

  it('requires a password before a social-only account can enable two-factor authentication', async () => {
    connection = await openTestDatabase()
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'social@example.com', password: 'password1234', name: 'Social' },
      returnHeaders: true,
    })
    await connection.database
      .update(account)
      .set({ providerId: 'google', issuer: 'https://accounts.google.com', accountId: 'google-user', password: null })
      .where(eq(account.providerId, 'credential'))

    await expect(
      auth.api.enableTwoFactor({ body: { password: 'password1234', method: 'totp' }, headers: cookieHeaders(signedUp.headers) }),
    ).rejects.toMatchObject({ status: 'BAD_REQUEST' })
  })

  it('adopts the social provider avatar for a brand-new sign-up', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret')
    configuredObjectStore.mockReturnValue({ bucket: 'praetorium', publicBaseUrl: S3_PUBLIC_BASE_URL, client: {} })
    const avatarUrl = 'https://accounts.google.example/avatar.png'
    const avatarBytes = Buffer.from('google-avatar-bytes')
    mockGoogleCallback(
      googleIdToken({ sub: 'google-user-1', email: 'newplayer@example.com', email_verified: true, name: 'New Player', picture: avatarUrl }),
      avatarUrl,
      avatarBytes,
    )
    const auth = createAuth(connection.database, SECRET)

    const callback = await signInWithGoogleCallback(auth)
    expect(callback.status).toBeGreaterThanOrEqual(300)
    expect(callback.status).toBeLessThan(400)

    const [stored] = await connection.database.select({ image: user.image }).from(user).where(eq(user.email, 'newplayer@example.com'))
    expect(stored?.image).toMatch(new RegExp(`^${S3_PUBLIC_BASE_URL}/avatars/[0-9a-f]{64}\\.png$`))
    expect(putIfAbsent).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('avatars/'), avatarBytes, 'image/png')
  })

  it('adopts the social provider avatar when linking to an existing account with no picture', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret')
    configuredObjectStore.mockReturnValue({ bucket: 'praetorium', publicBaseUrl: S3_PUBLIC_BASE_URL, client: {} })
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({ body: { email: 'linked@example.com', password: 'password1234', name: 'Linked Player' } })
    await connection.database.update(user).set({ emailVerified: true }).where(eq(user.id, signedUp.user.id))

    const avatarUrl = 'https://accounts.google.example/linked-avatar.png'
    const avatarBytes = Buffer.from('linked-google-avatar-bytes')
    mockGoogleCallback(
      googleIdToken({ sub: 'google-user-2', email: 'linked@example.com', email_verified: true, name: 'Linked Player', picture: avatarUrl }),
      avatarUrl,
      avatarBytes,
    )

    const callback = await signInWithGoogleCallback(auth)
    expect(callback.status).toBeGreaterThanOrEqual(300)
    expect(callback.status).toBeLessThan(400)

    const [stored] = await connection.database.select({ image: user.image }).from(user).where(eq(user.id, signedUp.user.id))
    expect(stored?.image).toMatch(new RegExp(`^${S3_PUBLIC_BASE_URL}/avatars/[0-9a-f]{64}\\.png$`))
    const [linkedAccount] = await connection.database
      .select({ providerId: account.providerId })
      .from(account)
      .where(and(eq(account.userId, signedUp.user.id), eq(account.providerId, 'google')))
    expect(linkedAccount).toBeDefined()
  })

  it('does not link a verified social identity to an unverified password account', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret')
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'unverified@example.com', password: 'password1234', name: 'Unverified' },
    })
    mockGoogleCallback(
      googleIdToken({ sub: 'google-unverified', email: 'unverified@example.com', email_verified: true, name: 'Victim' }),
      'https://accounts.google.example/unused.png',
      Buffer.from('unused'),
    )

    const callback = await signInWithGoogleCallback(auth)

    expect(new URL(callback.headers.get('location')!, 'http://localhost').searchParams.get('error')).toBe('account_not_linked')
    expect(
      await connection.database
        .select()
        .from(account)
        .where(and(eq(account.userId, signedUp.user.id), eq(account.providerId, 'google'))),
    ).toEqual([])
  })

  it('leaves an existing picture untouched when linking a social account', async () => {
    connection = await openTestDatabase()
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test-client-id')
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret')
    configuredObjectStore.mockReturnValue({ bucket: 'praetorium', publicBaseUrl: S3_PUBLIC_BASE_URL, client: {} })
    const auth = createAuth(connection.database, SECRET)
    const signedUp = await auth.api.signUpEmail({
      body: { email: 'haspicture@example.com', password: 'password1234', name: 'Has Picture' },
    })
    await connection.database
      .update(user)
      .set({ emailVerified: true, image: `${S3_PUBLIC_BASE_URL}/avatars/${'a'.repeat(64)}.webp` })
      .where(eq(user.id, signedUp.user.id))

    const avatarUrl = 'https://accounts.google.example/other-avatar.png'
    mockGoogleCallback(
      googleIdToken({
        sub: 'google-user-3',
        email: 'haspicture@example.com',
        email_verified: true,
        name: 'Has Picture',
        picture: avatarUrl,
      }),
      avatarUrl,
      Buffer.from('should-not-be-fetched'),
    )

    const callback = await signInWithGoogleCallback(auth)
    expect(callback.status).toBeGreaterThanOrEqual(300)
    expect(callback.status).toBeLessThan(400)

    const [stored] = await connection.database.select({ image: user.image }).from(user).where(eq(user.id, signedUp.user.id))
    expect(stored?.image).toBe(`${S3_PUBLIC_BASE_URL}/avatars/${'a'.repeat(64)}.webp`)
  })
})
