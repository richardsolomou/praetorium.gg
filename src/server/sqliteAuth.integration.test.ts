import { mkdtemp, rm } from 'node:fs/promises'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { importAuthSqlite } from '../../scripts/nodeAuthSqlite'
import { account, user } from '../db/authSchema'
import { oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken } from '../db/oauthSchema'
import { SqliteAccountRepository } from './accountRepository'
import { createSqliteAuth } from './sqliteAuth'
import { localAuthDatabase } from './localAuthDatabase'
import { validConsentQuery } from './mcpConsent'

const secret = 'praetorium-sqlite-auth-integration-secret'
let directory: string
let local: ReturnType<typeof localAuthDatabase>

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'praetorium-sqlite-auth-'))
  const file = path.join(directory, 'auth.sqlite')
  await importAuthSqlite(path.resolve('drizzle-auth/0000_curly_gambit.sql'), file)
  local = localAuthDatabase(file)
})

afterAll(async () => {
  local?.client.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

type AuthEvent = { userId: string; event: string; properties: { method: string } }
function authFor(environment: NodeJS.ProcessEnv, revoked: string[] = [], deleted: string[] = [], events?: AuthEvent[]) {
  return createSqliteAuth(local.database, secret, {
    environment,
    captureAuthentication: async (userId, event, properties) => {
      events?.push({ userId, event, properties })
    },
    deleteUserData: async (userId) => {
      deleted.push(userId)
    },
    revokeSessionAccess: async (id) => {
      revoked.push(id)
    },
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
}

it('signs up, claims an administrator, and revokes its product session', async () => {
  const revoked: string[] = []
  const auth = authFor({ APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' }, revoked)
  const created = await auth.api.signUpEmail({
    body: { email: 'admin@example.com', password: 'password1234', name: 'Admin' },
    returnHeaders: true,
  })
  const cookie = created.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sign-up did not set a session cookie')
  const headers = new Headers({ cookie })
  const current = await auth.api.getSession({ headers })
  expect(current?.user.role).toBe('admin')
  const { token } = await auth.api.getToken({ headers })
  await jwtVerify(token, createLocalJWKSet(await auth.api.getJwks()), {
    issuer: 'https://praetorium.gg/api/auth',
    audience: 'praetorium-test',
  })
  const discovery = await auth.handler(new Request('https://praetorium.gg/api/auth/.well-known/openid-configuration'))
  expect(await discovery.json()).toMatchObject({
    issuer: 'https://praetorium.gg/api/auth',
    jwks_uri: 'https://praetorium.gg/api/auth/jwks',
  })
  await auth.api.signOut({ headers })
  expect(revoked).toEqual([current!.session.id])
  expect(await auth.api.getSession({ headers })).toBeNull()
})

it.each([
  ['http://127.0.0.1:3000', 'http://localhost:3000'],
  ['http://localhost:3000', 'http://127.0.0.1:3000'],
])('signs in from the other loopback hostname when APP_URL is %s', async (appUrl, browserOrigin) => {
  const auth = authFor({ APP_URL: appUrl, AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' })
  const email = `${randomUUID()}@example.com`
  await auth.api.signUpEmail({ body: { email, password: 'password1234', name: 'Local player' } })
  const response = await auth.handler(
    new Request(`${browserOrigin}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: browserOrigin, Cookie: 'existing=1' },
      body: JSON.stringify({ email, password: 'password1234' }),
    }),
  )
  expect(response.status).toBe(200)
})

it.each(['http://localhost:3001', 'https://example.com'])('rejects sign-in from %s for a local app', async (browserOrigin) => {
  const appUrl = 'http://127.0.0.1:3000'
  const auth = authFor({ APP_URL: appUrl, AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' })
  const response = await auth.handler(
    new Request(`${appUrl}/api/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: browserOrigin, Cookie: 'existing=1' },
      body: JSON.stringify({ email: 'missing@example.com', password: 'password1234' }),
    }),
  )
  expect(response.status).toBe(403)
})

it('does not trust loopback sign-in origins for a hosted app', async () => {
  const auth = authFor({ APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' })
  const response = await auth.handler(
    new Request('https://praetorium.gg/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000', Cookie: 'existing=1' },
      body: JSON.stringify({ email: 'missing@example.com', password: 'password1234' }),
    }),
  )
  expect(response.status).toBe(403)
})

it('authorizes an MCP client with consent and resource-bound scopes', async () => {
  const auth = authFor({ APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' })
  const metadata = await auth.handler(new Request('https://praetorium.gg/.well-known/oauth-protected-resource/mcp'))
  expect(await metadata.json()).toMatchObject({
    resource: 'https://praetorium.gg/mcp',
    authorization_servers: ['https://praetorium.gg/api/auth'],
    scopes_supported: ['mcp:read', 'mcp:write'],
  })

  const registered = await auth.handler(
    new Request('https://praetorium.gg/api/auth/oauth2/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test MCP',
        redirect_uris: ['https://client.example/callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      }),
    }),
  )
  expect(registered.status).toBe(201)
  const { client_id: clientId } = await registered.json()

  const signup = await auth.api.signUpEmail({
    body: { email: 'mcp@example.com', password: 'password1234', name: 'MCP player' },
    returnHeaders: true,
  })
  const cookie = signup.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Missing session cookie')
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const authorizeUrl = new URL('https://praetorium.gg/api/auth/oauth2/authorize')
  for (const [key, value] of Object.entries({
    client_id: clientId,
    redirect_uri: 'https://client.example/callback',
    response_type: 'code',
    scope: 'mcp:read mcp:write offline_access',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: 'https://praetorium.gg/mcp',
    state: 'test-state',
  }))
    authorizeUrl.searchParams.set(key, value)
  const authorize = await auth.handler(new Request(authorizeUrl, { headers: { cookie } }))
  expect(authorize.status).toBe(302)
  const consentUrl = authorize.headers.get('location')
  if (!consentUrl) throw new Error('Missing consent redirect')
  const signedConsent = new URL(consentUrl, 'https://praetorium.gg')
  const consentSecret = (await auth.$context).secret
  expect(await validConsentQuery(signedConsent.search.slice(1), consentSecret)).toBe(true)
  signedConsent.searchParams.set('scope', 'mcp:write')
  expect(await validConsentQuery(signedConsent.search.slice(1), consentSecret)).toBe(false)
  const consent = await auth.handler(
    new Request('https://praetorium.gg/api/auth/oauth2/consent', {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json', Origin: 'https://praetorium.gg' },
      body: JSON.stringify({ accept: true, oauth_query: new URL(consentUrl, 'https://praetorium.gg').search.slice(1) }),
    }),
  )
  expect(consent.status).toBe(200)
  const consentResult = await consent.json()
  const code = new URL(consentResult.url).searchParams.get('code')
  if (!code) throw new Error('Missing authorization code')
  const token = await auth.handler(
    new Request('https://praetorium.gg/api/auth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: 'https://client.example/callback',
        code_verifier: verifier,
        resource: 'https://praetorium.gg/mcp',
      }),
    }),
  )
  expect(token.status).toBe(200)
  const issued = await token.json()
  const { payload } = await jwtVerify(issued.access_token, createLocalJWKSet(await auth.api.getJwks()), {
    issuer: 'https://praetorium.gg/api/auth',
    audience: 'https://praetorium.gg/mcp',
  })
  expect(payload).toMatchObject({ sub: signup.response.user.id, client_id: clientId, scope: 'mcp:read mcp:write offline_access' })
  expect(await auth.hasMcpConsent(signup.response.user.id, clientId)).toBe(true)
  const consents = await auth.api.getOAuthConsents({ headers: new Headers({ cookie }) })
  await local.database.insert(oauthConsent).values({
    id: randomUUID(),
    clientId,
    userId: signup.response.user.id,
    resources: JSON.stringify(['https://praetorium.gg/mcp']),
    scopes: JSON.stringify(['mcp:read']),
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  await auth.revokeMcpConsent(signup.response.user.id, consents[0]!.id)
  expect(await auth.hasMcpConsent(signup.response.user.id, clientId)).toBe(false)
  expect(await local.database.select().from(oauthAccessToken).where(eq(oauthAccessToken.clientId, clientId))).toHaveLength(0)
  expect(await local.database.select().from(oauthRefreshToken).where(eq(oauthRefreshToken.clientId, clientId))).toHaveLength(0)

  await auth.api.signOut({ headers: new Headers({ cookie }) })
  const signedOutAuthorize = await auth.handler(new Request(authorizeUrl))
  const loginUrl = signedOutAuthorize.headers.get('location')
  if (!loginUrl) throw new Error('Missing login redirect')
  expect(new URL(loginUrl, 'https://praetorium.gg').pathname).toBe('/sign-in')
  const login = await auth.handler(
    new Request('https://praetorium.gg/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://praetorium.gg' },
      body: JSON.stringify({
        email: 'mcp@example.com',
        password: 'password1234',
        oauth_query: new URL(loginUrl, 'https://praetorium.gg').search.slice(1),
      }),
    }),
  )
  expect(login.status).toBe(200)
  expect(await login.json()).toMatchObject({ url: expect.stringContaining('/mcp-consent?') })
  const signedInCookie = login.headers.get('set-cookie')?.split(';')[0]
  if (!signedInCookie) throw new Error('Missing login session cookie')
  const resumed = await auth.handler(
    new Request(`https://praetorium.gg/api/auth/oauth2/authorize${new URL(loginUrl, 'https://praetorium.gg').search}`, {
      headers: { cookie: signedInCookie },
    }),
  )
  expect(resumed.headers.get('location')).toContain('/mcp-consent?')
})

it('signs preview tokens with the revisioned issuer advertised by discovery', async () => {
  const issuer = `https://pr-606.praetorium.gg/api/auth/preview/${'c'.repeat(40)}`
  const auth = authFor({
    APP_URL: 'https://pr-606.praetorium.gg',
    AUTH_RATE_LIMIT: 'off',
    SPACETIME_AUDIENCE: 'praetorium-pr-606',
    SPACETIME_ISSUER: issuer,
  })
  const created = await auth.api.signUpEmail({
    body: { email: 'preview-issuer@example.com', password: 'password1234', name: 'Preview issuer' },
    returnHeaders: true,
  })
  const cookie = created.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Preview sign-up did not set a session cookie')
  const { token } = await auth.api.getToken({ headers: new Headers({ cookie }) })
  await jwtVerify(token, createLocalJWKSet(await auth.api.getJwks()), { issuer, audience: 'praetorium-pr-606' })
  const discovery = await auth.handler(new Request(`${issuer}/.well-known/openid-configuration`))
  expect(await discovery.json()).toMatchObject({ issuer, jwks_uri: 'https://pr-606.praetorium.gg/api/auth/jwks' })
})

it('rejects a preview issuer on another origin', () => {
  expect(() =>
    authFor({
      APP_URL: 'https://pr-606.praetorium.gg',
      SPACETIME_AUDIENCE: 'praetorium-pr-606',
      SPACETIME_ISSUER: `https://other.example/api/auth/preview/${'c'.repeat(40)}`,
    }),
  ).toThrow('Invalid SpacetimeDB preview issuer')
})

it('reads profiles and preserves the last sign-in method', async () => {
  const auth = authFor({ APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' })
  const created = await auth.api.signUpEmail({
    body: { email: 'linked@example.com', password: 'password1234', name: 'Linked user' },
    returnHeaders: true,
  })
  const cookie = created.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sign-up did not set a session cookie')
  const current = await auth.api.getSession({ headers: new Headers({ cookie }) })
  if (!current) throw new Error('Sign-up did not create a session')
  const accounts = new SqliteAccountRepository(local.database)
  expect((await accounts.profileByUserId(current.user.id))?.name).toBe('Linked user')
  expect((await accounts.adminUserRows({ query: 'Linked user' }, [])).users.map((row) => row.id)).toContain(current.user.id)
  expect((await accounts.searchPlayerRows('someone-else', 'Linked user', null, 20)).map((row) => row.id)).toContain(current.user.id)
  expect(await accounts.unlinkAccount(current.user.id, 'credential', ['credential', 'discord'])).toEqual({ status: 'last-method' })
  await local.database.insert(account).values({
    id: 'linked-discord-account',
    accountId: 'linked-discord-id',
    providerId: 'discord',
    userId: current.user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  expect(await accounts.unlinkAccount(current.user.id, 'credential', ['credential', 'discord'])).toMatchObject({ status: 'removed' })
  expect(await accounts.unlinkAccount(current.user.id, 'discord', ['credential', 'discord'])).toEqual({ status: 'last-method' })
  expect(await local.database.select({ id: account.id }).from(account).where(eq(account.userId, current.user.id))).toHaveLength(1)
})

const testEnvironment = { APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' }

async function signUpAs(auth: ReturnType<typeof authFor>, name: string, role: 'admin' | 'user') {
  const created = await auth.api.signUpEmail({
    body: { email: `${randomUUID()}@example.com`, password: 'password1234', name },
    returnHeaders: true,
  })
  const cookie = created.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sign-up did not set a session cookie')
  const current = await auth.api.getSession({ headers: new Headers({ cookie }) })
  if (!current) throw new Error('Sign-up did not create a session')
  await local.database.update(user).set({ role }).where(eq(user.id, current.user.id))
  return current
}

it('deletes a player for an administrator after clearing their product data and sessions', async () => {
  const revoked: string[] = []
  const deleted: string[] = []
  const auth = authFor(testEnvironment, revoked, deleted)
  const actor = await signUpAs(auth, 'Deleting admin', 'admin')
  const target = await signUpAs(auth, 'Deleted player', 'user')
  expect(await auth.deleteUserAsAdmin(actor.user.id, target.user.id)).toBe('deleted')
  expect({
    deleted,
    revoked,
    remaining: await local.database.select({ id: user.id }).from(user).where(eq(user.id, target.user.id)),
  }).toEqual({ deleted: [target.user.id], revoked: [target.session.id], remaining: [] })
})

it('refuses an administrator deletion of themselves, another administrator, or by a player', async () => {
  const deleted: string[] = []
  const auth = authFor(testEnvironment, [], deleted)
  const actor = await signUpAs(auth, 'Refusing admin', 'admin')
  const otherAdmin = await signUpAs(auth, 'Other admin', 'admin')
  const player = await signUpAs(auth, 'Refused player', 'user')
  expect({
    results: [
      await auth.deleteUserAsAdmin(actor.user.id, actor.user.id),
      await auth.deleteUserAsAdmin(actor.user.id, otherAdmin.user.id),
      await auth.deleteUserAsAdmin(player.user.id, otherAdmin.user.id),
      await auth.deleteUserAsAdmin(actor.user.id, 'missing-user'),
    ],
    deleted,
  }).toEqual({ results: ['self', 'admin', 'forbidden', 'missing'], deleted: [] })
})

it('records when a player was last seen without counting an administrator viewing as them', async () => {
  const auth = authFor(testEnvironment)
  const admin = await signUpAs(auth, 'Viewing admin', 'admin')
  const player = await signUpAs(auth, 'Viewed player', 'user')
  const seen = async () => (await local.database.select({ at: user.lastSeenAt }).from(user).where(eq(user.id, player.user.id)))[0]?.at
  const signedUp = await seen()
  const adminSignIn = await auth.api.signInEmail({ body: { email: admin.user.email, password: 'password1234' }, returnHeaders: true })
  const adminCookie = adminSignIn.headers.get('set-cookie')?.split(';')[0]
  if (!adminCookie) throw new Error('Sign-in did not set a session cookie')
  await auth.api.impersonateUser({ body: { userId: player.user.id }, headers: new Headers({ cookie: adminCookie }) })
  expect({ signedUp, afterViewing: await seen() }).toEqual({ signedUp: player.session.updatedAt, afterViewing: player.session.updatedAt })
})

async function insertPlayers(
  rows: { name: string; lastSeenAt?: Date | null; role?: 'admin' | 'user'; twoFactorEnabled?: boolean; emailVerified?: boolean }[],
) {
  const now = new Date()
  const ids = rows.map(() => randomUUID())
  await local.database.insert(user).values(
    rows.map((row, index) => ({
      id: ids[index]!,
      name: row.name,
      email: `${ids[index]}@example.com`,
      emailVerified: row.emailVerified ?? true,
      createdAt: new Date(now.getTime() - index),
      updatedAt: now,
      role: row.role ?? 'user',
      twoFactorEnabled: row.twoFactorEnabled ?? false,
      lastSeenAt: row.lastSeenAt ?? null,
    })),
  )
  return ids
}

it('pages through players by last seen with never-seen players last', async () => {
  const tag = randomUUID()
  const [never, older, newer] = await insertPlayers([
    { name: `Sorted ${tag} never` },
    { name: `Sorted ${tag} older`, lastSeenAt: new Date(1_000) },
    { name: `Sorted ${tag} newer`, lastSeenAt: new Date(2_000) },
  ])
  const accounts = new SqliteAccountRepository(local.database)
  const seen: string[] = []
  let cursor: Awaited<ReturnType<typeof accounts.adminUserRows>>['nextCursor'] = null
  do {
    const page = await accounts.adminUserRows({ query: `Sorted ${tag}`, sort: 'seen', cursor, limit: 1 }, [])
    seen.push(...page.users.map((row) => row.id))
    cursor = page.nextCursor
  } while (cursor)
  expect(seen).toEqual([newer, older, never])
})

it('narrows players to administrators, players without two-factor, or unverified emails', async () => {
  const tag = randomUUID()
  await insertPlayers([
    { name: `Filtered ${tag} admin`, role: 'admin', twoFactorEnabled: true },
    { name: `Filtered ${tag} secured`, twoFactorEnabled: true },
    { name: `Filtered ${tag} unverified`, twoFactorEnabled: true, emailVerified: false },
    { name: `Filtered ${tag} open` },
  ])
  const accounts = new SqliteAccountRepository(local.database)
  const ids = async (filter: 'admins' | 'no-two-factor' | 'unverified') =>
    (await accounts.adminUserRows({ query: `Filtered ${tag}`, filter }, [])).users.map((row) => row.name.split(' ').at(-1))
  expect({ admins: await ids('admins'), noTwoFactor: await ids('no-two-factor'), unverified: await ids('unverified') }).toEqual({
    admins: ['admin'],
    noTwoFactor: ['open'],
    unverified: ['unverified'],
  })
})

it('lists a player’s live sessions without their tokens and ends only that player’s session', async () => {
  const auth = authFor(testEnvironment)
  const player = await signUpAs(auth, 'Session player', 'user')
  const other = await signUpAs(auth, 'Other session player', 'user')
  const listed = await auth.userSessions(player.user.id)
  expect({
    ids: listed.map((row) => row.id),
    tokens: listed.some((row) => 'token' in row),
    foreign: await auth.revokeUserSession(other.user.id, player.session.id),
    own: await auth.revokeUserSession(player.user.id, player.session.id),
    after: (await auth.userSessions(player.user.id)).length,
  }).toEqual({ ids: [player.session.id], tokens: false, foreign: false, own: true, after: 0 })
})

it('renames a player and removes their picture through the profile checks', async () => {
  const checked: Record<string, unknown>[] = []
  const auth = createSqliteAuth(local.database, secret, {
    environment: testEnvironment,
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => {
      checked.push(data)
      return data.name === '' ? { ok: false, error: 'Enter a display name.' } : { ok: true, data }
    },
  })
  const player = await signUpAs(auth, 'Unmoderated name', 'user')
  await local.database.update(user).set({ image: 'https://example.com/picture.png' }).where(eq(user.id, player.user.id))
  const refused = await auth.moderateProfile(player.user.id, { name: '' })
  await auth.moderateProfile(player.user.id, { name: 'Moderated name' })
  await auth.moderateProfile(player.user.id, { image: null })
  const [row] = await local.database.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, player.user.id))
  expect({ refused, checked, row }).toEqual({
    refused: { ok: false, error: 'Enter a display name.' },
    checked: [{ name: '' }, { name: 'Moderated name' }, { image: null }],
    row: { name: 'Moderated name', image: null },
  })
})

it('lists a player’s MCP connections and revokes one with every token it issued', async () => {
  const auth = authFor(testEnvironment)
  const player = await signUpAs(auth, 'Granting player', 'user')
  const now = new Date()
  const consents: string[] = []
  for (const [name, resource] of [
    ['Granted client', 'https://praetorium.gg/mcp'],
    ['Other resource client', 'https://elsewhere.example/mcp'],
  ]) {
    const clientId = `https://client.example/${randomUUID()}`
    const consentId = randomUUID()
    consents.push(consentId)
    await local.database.insert(oauthClient).values({ id: randomUUID(), clientId, name, redirectUris: '[]', createdAt: now })
    await local.database.insert(oauthConsent).values({
      id: consentId,
      clientId,
      userId: player.user.id,
      resources: JSON.stringify([resource]),
      scopes: JSON.stringify(['mcp:read']),
      createdAt: now,
      updatedAt: now,
    })
    await local.database.insert(oauthAccessToken).values({
      id: randomUUID(),
      token: randomUUID(),
      clientId,
      userId: player.user.id,
      scopes: JSON.stringify(['mcp:read']),
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
    })
  }
  const listed = (await auth.mcpConnectionsFor(player.user.id)).map((connection) => connection.name)
  await auth.revokeMcpConsent(player.user.id, consents[0]!)
  expect({
    listed,
    after: await auth.mcpConnectionsFor(player.user.id),
    tokens: (await local.database.select().from(oauthAccessToken).where(eq(oauthAccessToken.userId, player.user.id))).length,
  }).toEqual({ listed: ['Granted client'], after: [], tokens: 1 })
})

const githubEnvironment = {
  APP_URL: 'https://praetorium.gg',
  AUTH_RATE_LIMIT: 'off',
  SPACETIME_AUDIENCE: 'praetorium-test',
  GITHUB_CLIENT_ID: 'github-client',
  GITHUB_CLIENT_SECRET: 'github-secret',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
}

it('starts GitHub sign-in with the configured OAuth app', async () => {
  const auth = authFor(githubEnvironment)

  expect((await auth.api.signInSocial({ body: { provider: 'github', callbackURL: '/' } })).url).toMatch(
    /^https:\/\/github\.com\/login\/oauth\/authorize\?/,
  )
})

it('signs a linked sponsor into the existing player account with GitHub', async () => {
  const userId = await playerWithGithub('github-returning@example.com', '9011')
  const accounts = new SqliteAccountRepository(local.database)
  await accounts.replaceGithubSponsors([{ githubId: '9011', public: true }])
  const auth = authFor(githubEnvironment)
  const start = await auth.handler(
    new Request('https://praetorium.gg/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://praetorium.gg' },
      body: JSON.stringify({ provider: 'github', callbackURL: '/profile' }),
    }),
  )
  const { url } = (await start.json()) as { url: string }
  const state = new URL(url).searchParams.get('state')
  if (!state) throw new Error('Missing OAuth state')
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const requestUrl = new URL(input instanceof Request ? input.url : input)
    if (requestUrl.pathname === '/login/oauth/access_token')
      return Response.json({ access_token: 'github-test-token', token_type: 'bearer' })
    if (requestUrl.pathname === '/user')
      return Response.json({ id: 9011, login: 'sponsor', name: 'Sponsor', email: 'github-returning@example.com', avatar_url: null })
    if (requestUrl.pathname === '/user/emails')
      return Response.json([{ email: 'github-returning@example.com', primary: true, verified: true }])
    throw new Error(`Unexpected OAuth request: ${requestUrl.origin}${requestUrl.pathname}`)
  })
  try {
    const callback = await auth.handler(
      new Request(`https://praetorium.gg/api/auth/callback/github?state=${encodeURIComponent(state)}&code=github-test-code`, {
        headers: { cookie: start.headers.get('set-cookie')?.split(';')[0] ?? '' },
      }),
    )
    expect(new URL(callback.headers.get('location') ?? '/', 'https://praetorium.gg').searchParams.get('error')).toBeNull()
    const cookie = callback.headers
      .getSetCookie()
      .find((value) => value.includes('session_token='))
      ?.split(';')[0]
    const signedIn = cookie ? await auth.api.getSession({ headers: new Headers({ cookie }) }) : null
    expect([callback.status, signedIn?.user.id, await accounts.githubSponsorship(userId)]).toEqual([302, userId, 'public'])
  } finally {
    vi.unstubAllGlobals()
  }
})

it('still starts sign-in with the other configured providers', async () => {
  const auth = authFor(githubEnvironment)

  expect((await auth.api.signInSocial({ body: { provider: 'google', callbackURL: '/' } })).url).toMatch(
    /^https:\/\/accounts\.google\.com\//,
  )
})

async function playerWithGithub(email: string, githubId: string | null) {
  const auth = authFor(githubEnvironment)
  const created = await auth.api.signUpEmail({ body: { email, password: 'password1234', name: email } })
  if (githubId)
    await local.database.insert(account).values({
      id: randomUUID(),
      accountId: githubId,
      providerId: 'github',
      userId: created.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  return created.user.id
}

it('reads a linked public sponsorship', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const userId = await playerWithGithub('public-sponsor@example.com', '9001')
  await accounts.replaceGithubSponsors([{ githubId: '9001', public: true }])

  expect(await accounts.githubSponsorship(userId)).toBe('public')
})

it('reads a linked private sponsorship as private', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const userId = await playerWithGithub('private-sponsor@example.com', '9002')
  await accounts.replaceGithubSponsors([{ githubId: '9002', public: false }])

  expect(await accounts.githubSponsorship(userId)).toBe('private')
})

it('finds no sponsorship for a player who has not linked the sponsoring GitHub account', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const userId = await playerWithGithub('unlinked-sponsor@example.com', null)
  await accounts.replaceGithubSponsors([{ githubId: '9003', public: true }])

  expect(await accounts.githubSponsorship(userId)).toBeNull()
})

it('recognizes administrators without depending on their GitHub link', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const admin = await playerWithGithub('badge-admin@example.com', null)
  const player = await playerWithGithub('badge-player@example.com', '9007')
  await local.database.update(user).set({ role: 'admin' }).where(eq(user.id, admin))

  expect(await Promise.all([admin, player].map((id) => accounts.isAdmin(id)))).toEqual([true, false])
})

it('drops a sponsorship GitHub no longer lists', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const userId = await playerWithGithub('lapsed-sponsor@example.com', '9004')
  await accounts.replaceGithubSponsors([{ githubId: '9004', public: true }])
  await accounts.replaceGithubSponsors([{ githubId: '9999', public: true }])

  expect(await accounts.githubSponsorship(userId)).toBeNull()
})

it('counts a linked GitHub account as a sign-in method', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const userId = await playerWithGithub('only-password@example.com', '9005')

  expect(await accounts.unlinkAccount(userId, 'credential', ['credential', 'github'])).toMatchObject({ status: 'removed' })
})

it('shows a linked GitHub account among sign-in methods for administrators', async () => {
  const accounts = new SqliteAccountRepository(local.database)
  const userId = await playerWithGithub('admin-listed-sponsor@example.com', '9006')

  const { users } = await accounts.adminUserRows({ query: 'admin-listed-sponsor@example.com' }, [])

  expect(users.find((row) => row.id === userId)?.signInMethods.map((method) => method.providerId)).toEqual(['credential', 'github'])
})

it('captures confirmed email account creation once and distinguishes later sign-ins', async () => {
  const events: AuthEvent[] = []
  const auth = authFor(githubEnvironment, [], [], events)
  const body = { email: 'analytics-email@example.test', password: 'password1234', name: 'Player' }
  const created = await auth.api.signUpEmail({ body })
  await expect(auth.api.signInEmail({ body: { ...body, password: 'wrong-password' } })).rejects.toThrow()
  await auth.api.signInEmail({ body })
  expect(events).toEqual([
    { userId: created.user.id, event: 'account_created', properties: { method: 'email' } },
    { userId: created.user.id, event: 'account_signed_in', properties: { method: 'email' } },
  ])
})

it('does not count a password challenge as a sign-in before two-factor verification', async () => {
  const events: AuthEvent[] = []
  const auth = authFor(githubEnvironment, [], [], events)
  const body = { email: 'analytics-two-factor@example.test', password: 'password1234', name: 'Player' }
  const created = await auth.api.signUpEmail({ body, returnHeaders: true })
  const headers = new Headers({ cookie: created.headers.get('set-cookie')!.split(';')[0]! })
  const enabled = await auth.api.enableTwoFactor({ body: { password: body.password }, headers })
  if (enabled.method !== 'totp') throw new Error('Expected authenticator setup')
  await local.database.update(user).set({ twoFactorEnabled: true }).where(eq(user.id, created.response.user.id))
  events.length = 0
  const challenge = await auth.api.signInEmail({ body, returnHeaders: true })
  expect(events).toEqual([])
  const challengeHeaders = new Headers({
    cookie: challenge.headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; '),
  })
  await auth.api.verifyBackupCode({ body: { code: enabled.backupCodes[0]! }, headers: challengeHeaders })
  expect(events).toEqual([{ userId: created.response.user.id, event: 'account_signed_in', properties: { method: 'two_factor' } }])
})

it('keeps authentication working when analytics capture fails', async () => {
  const events: AuthEvent[] = []
  vi.spyOn(events, 'push').mockImplementation(() => {
    throw new Error('Analytics unavailable')
  })
  const auth = authFor(githubEnvironment, [], [], events)
  const body = { email: 'analytics-unavailable@example.test', password: 'password1234', name: 'Player' }
  await auth.api.signUpEmail({ body })
  const signedIn = await auth.api.signInEmail({ body })
  expect(signedIn.user.email).toBe(body.email)
})

it.each(['github', 'google'])('captures actual %s account creation once, then sign-in when the same player returns', async (provider) => {
  const events: AuthEvent[] = []
  const auth = authFor(githubEnvironment, [], [], events)
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const key = { ...(await exportJWK(publicKey)), kid: 'analytics-test', alg: 'RS256' }
  const idToken = await new SignJWT({
    sub: 'analytics-google',
    email: 'analytics-google@example.test',
    email_verified: true,
    name: 'Player',
  })
    .setProtectedHeader({ alg: 'RS256', kid: key.kid })
    .setIssuer('https://accounts.google.com')
    .setAudience('google-client')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.href === 'https://oauth2.googleapis.com/token')
      return Response.json({ access_token: 'test-token', token_type: 'bearer', id_token: idToken })
    if (url.href === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({ keys: [key] })
    if (url.pathname === '/login/oauth/access_token') return Response.json({ access_token: 'test-token', token_type: 'bearer' })
    if (url.pathname === '/user')
      return Response.json({ id: 91999, login: 'analytics', name: 'Player', email: 'analytics-social@example.test', avatar_url: null })
    if (url.pathname === '/user/emails') return Response.json([{ email: 'analytics-social@example.test', primary: true, verified: true }])
    throw new Error(`Unexpected OAuth request: ${url.pathname}`)
  })
  try {
    for (let visit = 0; visit < 2; visit++) {
      const start = await auth.handler(
        new Request('https://praetorium.gg/api/auth/sign-in/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: 'https://praetorium.gg' },
          body: JSON.stringify({ provider, callbackURL: '/rosters', requestSignUp: true }),
        }),
      )
      const { url } = (await start.json()) as { url: string }
      const state = new URL(url).searchParams.get('state')!
      const callback = await auth.handler(
        new Request(`https://praetorium.gg/api/auth/callback/${provider}?state=${encodeURIComponent(state)}&code=test-code`, {
          headers: { cookie: start.headers.get('set-cookie')?.split(';')[0] ?? '' },
        }),
      )
      expect(callback.headers.get('location')).toBe('/rosters')
    }
    expect(events.map(({ event, properties }) => ({ event, properties }))).toEqual([
      { event: 'account_created', properties: { method: provider } },
      { event: 'account_signed_in', properties: { method: provider } },
    ])
  } finally {
    vi.unstubAllGlobals()
  }
})
