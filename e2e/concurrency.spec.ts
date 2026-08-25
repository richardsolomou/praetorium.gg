import { expect, test } from '@playwright/test'
import { count, eq } from 'drizzle-orm'
import postgres from 'postgres'
import { openDatabase, type PraetoriumConnection } from '../src/db/connection'
import { Repository } from '../src/db/repository'
import { account, user } from '../src/db/schema'
import { createAuth } from '../src/server/auth'
import { postgresPort } from './stackEnv'

const SECRET = 'test-secret-0123456789abcdef0123456789abcdef'
process.env.APP_URL ??= 'http://localhost'

async function isolatedDatabase(work: (left: PraetoriumConnection, right: PraetoriumConnection) => Promise<void>) {
  const name = `praetorium_concurrency_${process.pid}_${Date.now()}`
  const administrator = postgres(`postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/postgres`, { max: 1 })
  await administrator.unsafe(`create database "${name}"`)
  const url = `postgres://praetorium:praetorium@127.0.0.1:${postgresPort}/${name}`
  const left = openDatabase(url)
  const right = openDatabase(url)
  try {
    await left.migrate()
    await work(left, right)
  } finally {
    await Promise.all([left.close(), right.close()])
    await administrator.unsafe(`drop database "${name}" with (force)`)
    await administrator.end()
  }
}

test('concurrent first sign-ups on independent connections assign one administrator', async () => {
  await isolatedDatabase(async (left, right) => {
    const leftAuth = createAuth(left.database, SECRET)
    const rightAuth = createAuth(right.database, SECRET)

    await Promise.all([
      leftAuth.api.signUpEmail({ body: { email: 'left@example.test', password: 'password1234', name: 'Left' } }),
      rightAuth.api.signUpEmail({ body: { email: 'right@example.test', password: 'password1234', name: 'Right' } }),
    ])

    const [administrators] = await left.database.select({ count: count() }).from(user).where(eq(user.role, 'admin'))
    expect(administrators?.count).toBe(1)
  })
})

test('concurrent administrator demotions preserve one administrator', async () => {
  await isolatedDatabase(async (left, right) => {
    const leftAuth = createAuth(left.database, SECRET)
    const rightAuth = createAuth(right.database, SECRET)
    const first = await leftAuth.api.signUpEmail({ body: { email: 'first@example.test', password: 'password1234', name: 'First' } })
    const second = await rightAuth.api.signUpEmail({ body: { email: 'second@example.test', password: 'password1234', name: 'Second' } })
    await leftAuth.changeUserRole(first.user.id, second.user.id, 'admin')

    const results = await Promise.all([
      leftAuth.changeUserRole(first.user.id, second.user.id, 'user'),
      rightAuth.changeUserRole(second.user.id, first.user.id, 'user'),
    ])
    const [administrators] = await left.database.select({ count: count() }).from(user).where(eq(user.role, 'admin'))

    expect({ administrators: administrators?.count, results: results.toSorted() }).toEqual({
      administrators: 1,
      results: ['changed', 'forbidden'],
    })
  })
})

test('concurrent unlinks on independent connections preserve one sign-in method', async () => {
  await isolatedDatabase(async (left, right) => {
    const auth = createAuth(left.database, SECRET)
    const signedUp = await auth.api.signUpEmail({ body: { email: 'player@example.test', password: 'password1234', name: 'Player' } })
    await left.database.insert(account).values({
      id: 'google-account',
      accountId: 'google-account',
      issuer: 'https://accounts.google.com',
      providerId: 'google',
      userId: signedUp.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const results = await Promise.all([
      new Repository(left.database).unlinkAccount(signedUp.user.id, 'credential', ['credential', 'google']),
      new Repository(right.database).unlinkAccount(signedUp.user.id, 'google', ['credential', 'google']),
    ])
    const remaining = await left.database
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, signedUp.user.id))

    expect({ remaining: remaining.length, results: results.toSorted() }).toEqual({ remaining: 1, results: ['last-method', 'removed'] })
  })
})
