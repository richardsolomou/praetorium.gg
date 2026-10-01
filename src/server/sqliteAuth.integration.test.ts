import { mkdtemp, rm } from 'node:fs/promises'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
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

function authFor(environment: NodeJS.ProcessEnv, revoked: string[] = [], deleted: string[] = []) {
  return createSqliteAuth(local.database, secret, {
    environment,
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
