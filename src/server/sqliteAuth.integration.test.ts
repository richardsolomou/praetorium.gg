import { mkdtemp, rm } from 'node:fs/promises'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { importAuthSqlite } from '../../scripts/nodeAuthSqlite'
import { account } from '../db/authSchema'
import { oauthAccessToken, oauthConsent, oauthRefreshToken } from '../db/oauthSchema'
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

function authFor(environment: NodeJS.ProcessEnv, revoked: string[] = []) {
  return createSqliteAuth(local.database, secret, {
    environment,
    deleteUserData: async () => {},
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
