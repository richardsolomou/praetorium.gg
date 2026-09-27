import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { getPlatformProxy } from 'wrangler'
import { account, schema, user } from '../src/db/d1AuthSchema'
import { D1AccountRepository } from '../src/server/d1AccountRepository'
import { createD1Auth } from '../src/server/d1Auth'

type Binding = Parameters<typeof drizzle>[0]
const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

async function isolatedDatabase(work: (left: Binding, right: Binding) => Promise<void>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-d1-concurrency-'))
  const configPath = path.join(directory, 'wrangler.json')
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'praetorium-d1-concurrency',
      main: 'index.js',
      compatibility_date: '2026-09-17',
      d1_databases: [{ binding: 'AUTH_DB', database_name: 'praetorium-d1-concurrency', database_id: randomUUID() }],
    }),
  )
  const first = await getPlatformProxy<{ AUTH_DB: Binding }>({ configPath, persist: { path: directory }, envFiles: [] })
  try {
    const migration = await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8')
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await first.env.AUTH_DB.prepare(statement).run()
    }
    const second = await getPlatformProxy<{ AUTH_DB: Binding }>({ configPath, persist: { path: directory }, envFiles: [] })
    try {
      await work(first.env.AUTH_DB, second.env.AUTH_DB)
    } finally {
      await second.dispose()
    }
  } finally {
    await first.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

function auth(binding: Binding) {
  return createD1Auth(binding, SECRET, {
    environment: { APP_URL: 'http://localhost', SPACETIME_AUDIENCE: 'praetorium-test', AUTH_RATE_LIMIT: 'off' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
}

test('concurrent first sign-ups on independent D1 connections assign one administrator', async () => {
  await isolatedDatabase(async (left, right) => {
    await Promise.all([
      auth(left).api.signUpEmail({ body: { email: 'left@example.test', password: 'password1234', name: 'Left' } }),
      auth(right).api.signUpEmail({ body: { email: 'right@example.test', password: 'password1234', name: 'Right' } }),
    ])
    const [administrators] = await drizzle(left).select({ count: count() }).from(user).where(eq(user.role, 'admin'))
    expect(administrators?.count).toBe(1)
  })
})

test('concurrent administrator demotions preserve one administrator in D1', async () => {
  await isolatedDatabase(async (left, right) => {
    const leftAuth = auth(left)
    const rightAuth = auth(right)
    const first = await leftAuth.api.signUpEmail({ body: { email: 'first@example.test', password: 'password1234', name: 'First' } })
    const second = await rightAuth.api.signUpEmail({ body: { email: 'second@example.test', password: 'password1234', name: 'Second' } })
    await leftAuth.changeUserRole(first.user.id, second.user.id, 'admin')
    const results = await Promise.all([
      leftAuth.changeUserRole(first.user.id, second.user.id, 'user'),
      rightAuth.changeUserRole(second.user.id, first.user.id, 'user'),
    ])
    const [administrators] = await drizzle(left).select({ count: count() }).from(user).where(eq(user.role, 'admin'))
    expect({ administrators: administrators?.count, results: results.toSorted() }).toEqual({
      administrators: 1,
      results: ['changed', 'forbidden'],
    })
  })
})

test('concurrent unlinks on independent D1 connections preserve one sign-in method', async () => {
  await isolatedDatabase(async (left, right) => {
    const created = await auth(left).api.signUpEmail({ body: { email: 'player@example.test', password: 'password1234', name: 'Player' } })
    await drizzle(left, { schema }).insert(account).values({
      id: 'google-account',
      accountId: 'google-account',
      issuer: 'https://accounts.google.com',
      providerId: 'google',
      userId: created.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const results = await Promise.all([
      new D1AccountRepository(left).unlinkAccount(created.user.id, 'credential', ['credential', 'google']),
      new D1AccountRepository(right).unlinkAccount(created.user.id, 'google', ['credential', 'google']),
    ])
    const remaining = await drizzle(left)
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, created.user.id))
    expect({ remaining: remaining.length, results: results.map((result) => result.status).toSorted() }).toEqual({
      remaining: 1,
      results: ['last-method', 'removed'],
    })
  })
})
