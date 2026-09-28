import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { importAuthSqlite } from '../../scripts/nodeAuthSqlite'
import { account } from '../db/authSchema'
import { SqliteAccountRepository } from './accountRepository'
import { createSqliteAuth } from './sqliteAuth'
import { localAuthDatabase } from './localAuthDatabase'

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
  const discovery = await auth.handler(new Request('https://pr-606.praetorium.gg/api/auth/.well-known/openid-configuration'))
  expect(await discovery.json()).toMatchObject({ issuer, jwks_uri: `${issuer}/jwks` })
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
