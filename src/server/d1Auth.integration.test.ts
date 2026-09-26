import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { drizzle } from 'drizzle-orm/d1'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { getPlatformProxy, type PlatformProxy } from 'wrangler'
import { createD1Auth } from './d1Auth'
import { handleD1Bridge, remoteD1 } from './d1Bridge'
import { D1AccountRepository } from './d1AccountRepository'
import { account, schema } from '../db/d1AuthSchema'

const secret = 'praetorium-d1-auth-integration-secret'
let directory: string
let proxy: PlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'praetorium-d1-auth-'))
  const configPath = path.join(directory, 'wrangler.jsonc')
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'praetorium-d1-auth-test',
      main: 'index.js',
      compatibility_date: '2026-09-17',
      d1_databases: [{ binding: 'AUTH_DB', database_name: 'praetorium-d1-auth-test', database_id: '00000000-0000-4000-8000-000000000001' }],
    }),
  )
  proxy = await getPlatformProxy<{ AUTH_DB: Parameters<typeof drizzle>[0] }>({ configPath, persist: false, envFiles: [] })
  const migration = await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8')
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) await proxy.env.AUTH_DB.prepare(statement).run()
  }
})

afterAll(async () => {
  await proxy?.dispose()
  if (directory) await rm(directory, { recursive: true, force: true })
})

it('signs up, claims an administrator, and revokes a D1 session through the runtime hook', async () => {
  const revoked: string[] = []
  const auth = createD1Auth(proxy.env.AUTH_DB, secret, {
    environment: { APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' },
    deleteUserData: async () => {},
    revokeSessionAccess: async (id) => {
      revoked.push(id)
    },
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  const created = await auth.api.signUpEmail({
    body: { email: 'd1-admin@example.com', password: 'password1234', name: 'D1 admin' },
    returnHeaders: true,
  })
  const cookie = created.headers.get('set-cookie')?.split(';')[0]
  expect(cookie).toBeTruthy()
  const headers = new Headers({ cookie: cookie! })
  const current = await auth.api.getSession({ headers })
  expect(current?.user.role).toBe('admin')
  const { token } = await auth.api.getToken({ headers })
  const jwks = await auth.api.getJwks()
  const verified = await jwtVerify(token, createLocalJWKSet(jwks), {
    issuer: 'https://praetorium.gg/api/auth',
    audience: 'praetorium-test',
  })
  expect(verified.payload).toMatchObject({ sub: current!.session.id, userId: current!.user.id, tokenType: 'spacetime-access' })
  const discovery = await auth.handler(new Request('https://praetorium.gg/api/auth/.well-known/openid-configuration'))
  expect(await discovery.json()).toMatchObject({
    issuer: 'https://praetorium.gg/api/auth',
    jwks_uri: 'https://praetorium.gg/api/auth/jwks',
  })
  await auth.api.signOut({ headers })
  expect(revoked).toEqual([current!.session.id])
  expect(await auth.api.getSession({ headers })).toBeNull()
})

it('runs Better Auth requests through the container D1 bridge', async () => {
  const binding = remoteD1('http://d1.internal/query', async (url, init) => handleD1Bridge(new Request(url, init), proxy.env.AUTH_DB))
  const auth = createD1Auth(binding, secret, {
    environment: { APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  const created = await auth.api.signUpEmail({
    body: { email: 'bridge@example.com', password: 'password1234', name: 'D1 bridge' },
    returnHeaders: true,
  })
  const cookie = created.headers.get('set-cookie')?.split(';')[0]
  const current = await auth.api.getSession({ headers: new Headers({ cookie: cookie! }) })
  expect(current?.user.email).toBe('bridge@example.com')

  const accounts = new D1AccountRepository(binding)
  expect((await accounts.profileByUserId(current!.user.id))?.name).toBe('D1 bridge')
  expect((await accounts.adminUserRows({ query: 'D1 bridge' }, [])).users.map((row) => row.id)).toContain(current!.user.id)
  expect((await accounts.searchPlayerRows('someone-else', 'D1 bridge', null, 20)).map((row) => row.id)).toContain(current!.user.id)
  expect(await accounts.unlinkAccount(current!.user.id, 'credential', ['credential', 'discord'])).toEqual({ status: 'last-method' })
  await drizzle(binding, { schema }).insert(account).values({
    id: 'bridge-discord-account',
    accountId: 'bridge-discord-id',
    providerId: 'discord',
    userId: current!.user.id,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  expect(await accounts.unlinkAccount(current!.user.id, 'credential', ['credential', 'discord'])).toMatchObject({ status: 'removed' })
  expect(await accounts.unlinkAccount(current!.user.id, 'discord', ['credential', 'discord'])).toEqual({ status: 'last-method' })

  await binding.prepare('create table bridge_batch_test (id integer primary key)').run()
  await binding.batch([
    binding.prepare('insert into bridge_batch_test (id) values (?)').bind(1),
    binding.prepare('insert into bridge_batch_test (id) values (?)').bind(2),
  ])
  expect((await binding.prepare('select id from bridge_batch_test order by id').raw()).flat()).toEqual([1, 2])
})
