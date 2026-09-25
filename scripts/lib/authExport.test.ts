import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from '../../src/db/connection'
import { account, rateLimit, session, twoFactor, user, verification } from '../../src/db/schema'
import { openTestDatabase } from '../../src/db/testDatabase'
import { exportAuthSql } from './authExport'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

it('imports a consistent auth snapshot with accounts, sessions, and two-factor data into SQLite', async () => {
  connection = await openTestDatabase()
  const database = connection.database
  await database.delete(user)
  const created = new Date('2026-09-25T12:34:56.789Z')
  await database.insert(user).values([
    {
      id: 'player-one',
      name: "O'Brien",
      email: 'one@example.com',
      emailVerified: true,
      createdAt: created,
      updatedAt: created,
      role: 'admin',
      twoFactorEnabled: true,
    },
    {
      id: 'player-two',
      name: 'Two',
      email: 'two@example.com',
      emailVerified: false,
      createdAt: created,
      updatedAt: created,
    },
  ])
  await database.insert(account).values([
    {
      id: 'password-account',
      accountId: 'player-one',
      providerId: 'credential',
      userId: 'player-one',
      password: 'preserved-password-hash',
      createdAt: created,
      updatedAt: created,
    },
    {
      id: 'apple-account',
      accountId: "apple'identity",
      providerId: 'apple',
      userId: 'player-one',
      accessToken: "encrypted'access",
      refreshToken: 'encrypted-refresh',
      accessTokenExpiresAt: created,
      createdAt: created,
      updatedAt: created,
    },
  ])
  await database.insert(session).values({
    id: 'existing-session',
    expiresAt: new Date('2026-10-25T12:34:56.789Z'),
    token: 'preserved-cookie-token',
    createdAt: created,
    updatedAt: created,
    userId: 'player-one',
    impersonatedBy: 'player-two',
  })
  await database.insert(verification).values({
    id: 'verification-one',
    identifier: "verify'one",
    value: 'hashed-verification',
    expiresAt: new Date('2026-09-26T12:34:56.789Z'),
    createdAt: created,
    updatedAt: created,
  })
  await database.insert(twoFactor).values({
    id: 'factor-one',
    secret: 'encrypted-factor',
    backupCodes: 'encrypted-backup-codes',
    userId: 'player-one',
    verified: true,
    failedVerificationCount: 2,
    lockedUntil: created,
  })
  await database.insert(rateLimit).values({ id: 'limiter-one', key: 'sign-in:ip', count: 3, lastRequest: created.getTime() })

  const sql = await exportAuthSql(database)
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec('PRAGMA foreign_keys = ON;')
    sqlite.exec(readFileSync(new URL('../../drizzle-auth/0000_curly_gambit.sql', import.meta.url), 'utf8'))
    sqlite.exec(sql)

    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.prepare('SELECT id, name, emailVerified, role, twoFactorEnabled, createdAt FROM user ORDER BY id').all()).toEqual([
      {
        id: 'player-one',
        name: "O'Brien",
        emailVerified: 1,
        role: 'admin',
        twoFactorEnabled: 1,
        createdAt: created.getTime(),
      },
      {
        id: 'player-two',
        name: 'Two',
        emailVerified: 0,
        role: 'user',
        twoFactorEnabled: 0,
        createdAt: created.getTime(),
      },
    ])
    expect(
      sqlite
        .prepare('SELECT providerId, accountId, password, accessToken, refreshToken, accessTokenExpiresAt FROM account ORDER BY id')
        .all(),
    ).toEqual([
      {
        providerId: 'apple',
        accountId: "apple'identity",
        password: null,
        accessToken: "encrypted'access",
        refreshToken: 'encrypted-refresh',
        accessTokenExpiresAt: created.getTime(),
      },
      {
        providerId: 'credential',
        accountId: 'player-one',
        password: 'preserved-password-hash',
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
      },
    ])
    expect(sqlite.prepare('SELECT token, impersonatedBy FROM session').get()).toEqual({
      token: 'preserved-cookie-token',
      impersonatedBy: 'player-two',
    })
    expect(sqlite.prepare('SELECT identifier, value FROM verification').get()).toEqual({
      identifier: "verify'one",
      value: 'hashed-verification',
    })
    expect(sqlite.prepare('SELECT secret, backupCodes, failedVerificationCount, lockedUntil FROM twoFactor').get()).toEqual({
      secret: 'encrypted-factor',
      backupCodes: 'encrypted-backup-codes',
      failedVerificationCount: 2,
      lockedUntil: created.getTime(),
    })
    expect(sqlite.prepare('SELECT count, lastRequest FROM rateLimit').get()).toEqual({ count: 3, lastRequest: created.getTime() })
    expect(() =>
      sqlite
        .prepare('INSERT INTO twoFactor (id, secret, backupCodes, userId) VALUES (?, ?, ?, ?)')
        .run('invalid-factor', 'secret', 'codes', 'missing-user'),
    ).toThrow('FOREIGN KEY constraint failed')
  } finally {
    sqlite.close()
  }
})

it('exports an empty auth database without inserts', async () => {
  connection = await openTestDatabase()
  await connection.database.delete(user)

  expect(await exportAuthSql(connection.database)).toBe('\n')
})
