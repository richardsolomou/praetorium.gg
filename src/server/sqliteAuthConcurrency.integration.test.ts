import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import { migrateAuthSqlite } from '../../scripts/nodeAuthSqlite'
import { account, user } from '../db/authSchema'
import { SqliteAccountRepository } from './accountRepository'
import { createSqliteAuth } from './sqliteAuth'
import { localAuthDatabase } from './localAuthDatabase'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'

async function isolatedDatabase(
  work: (left: ReturnType<typeof localAuthDatabase>, right: ReturnType<typeof localAuthDatabase>) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), 'praetorium-sqlite-concurrency-'))
  const file = path.join(directory, 'auth.sqlite')
  const migration = await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8')
  const initialized = new DatabaseSync(file)
  initialized.exec(migration)
  initialized.exec('pragma journal_mode = wal')
  initialized.close()
  migrateAuthSqlite(file)
  const left = localAuthDatabase(file)
  const right = localAuthDatabase(file)
  try {
    await work(left, right)
  } finally {
    left.client.close()
    right.client.close()
    await rm(directory, { recursive: true, force: true })
  }
}

function auth(connection: ReturnType<typeof localAuthDatabase>) {
  return createSqliteAuth(connection.database, SECRET, {
    environment: { APP_URL: 'http://localhost', SPACETIME_AUDIENCE: 'praetorium-test', AUTH_RATE_LIMIT: 'off' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
}

test('concurrent first sign-ups on independent SQLite connections assign one administrator', async () => {
  await isolatedDatabase(async (left, right) => {
    await Promise.all([
      auth(left).api.signUpEmail({ body: { email: 'left@example.test', password: 'password1234', name: 'Left' } }),
      auth(right).api.signUpEmail({ body: { email: 'right@example.test', password: 'password1234', name: 'Right' } }),
    ])
    const administrators = await left.database.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
    expect(administrators).toHaveLength(1)
  })
})

test('concurrent administrator demotions preserve one administrator in SQLite', async () => {
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
    const administrators = await left.database.select({ id: user.id }).from(user).where(eq(user.role, 'admin'))
    expect({ administrators: administrators.length, results: results.toSorted() }).toEqual({
      administrators: 1,
      results: ['changed', 'forbidden'],
    })
  })
})

test('concurrent unlinks on independent SQLite connections preserve one sign-in method', async () => {
  await isolatedDatabase(async (left, right) => {
    const created = await auth(left).api.signUpEmail({ body: { email: 'player@example.test', password: 'password1234', name: 'Player' } })
    await left.database.insert(account).values({
      id: 'google-account',
      accountId: 'google-account',
      issuer: 'https://accounts.google.com',
      providerId: 'google',
      userId: created.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const results = await Promise.all([
      new SqliteAccountRepository(left.database).unlinkAccount(created.user.id, 'credential', ['credential', 'google']),
      new SqliteAccountRepository(right.database).unlinkAccount(created.user.id, 'google', ['credential', 'google']),
    ])
    const remaining = await left.database
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, created.user.id))
    expect({ remaining: remaining.length, results: results.map((result) => result.status).toSorted() }).toEqual({
      remaining: 1,
      results: ['last-method', 'removed'],
    })
  })
})
