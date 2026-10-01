import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { user } from '../src/db/authSchema'
import { createSqliteAuth } from '../src/server/sqliteAuth'
import { localAuthDatabase } from '../src/server/localAuthDatabase'
import { backupAuthSqlite, importAuthSqlite, migrateAuthSqlite, verifyAuthSqlite } from './nodeAuthSqlite'

let directory: string
const secret = 'node-sqlite-rehearsal-auth-secret'
const execFile = promisify(execFileCallback)

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'praetorium-auth-'))
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

function authFor(file: string) {
  const local = localAuthDatabase(file)
  const auth = createSqliteAuth(local.database, secret, {
    environment: { APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' },
    deleteUserData: async () => {},
    revokeSessionAccess: async () => {},
    storeSocialAvatar: async () => null,
    updateProfile: async (data) => ({ ok: true, data }),
  })
  return { ...local, auth }
}

it('adds later migrations once when two processes start against an existing auth database', async () => {
  const file = path.join(directory, 'existing-auth.sqlite')
  const database = new DatabaseSync(file)
  database.exec(await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  database.close()
  const script = `import { migrateAuthSqlite } from './scripts/nodeAuthSqlite.ts'; migrateAuthSqlite(process.env.AUTH_REPLICA_FILE)`
  await Promise.all(
    Array.from({ length: 2 }, () =>
      execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
        cwd: path.resolve('.'),
        env: { ...process.env, AUTH_REPLICA_FILE: file },
        timeout: 30_000,
      }),
    ),
  )
  migrateAuthSqlite(file)
  const migrated = new DatabaseSync(file, { readOnly: true })
  try {
    expect({
      oauth: migrated.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'oauthConsent'").get()?.count,
      lastSeen: migrated
        .prepare("select name from pragma_table_info('user')")
        .all()
        .some((row) => row.name === 'lastSeenAt'),
    }).toEqual({ oauth: 1, lastSeen: true })
  } finally {
    migrated.close()
  }
})

it('backfills when each player was last seen from their own sessions, not support sessions', async () => {
  const file = path.join(directory, 'last-seen-auth.sqlite')
  const database = new DatabaseSync(file)
  database.exec(await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  database.exec(await readFile(path.resolve('drizzle-auth/0001_sad_absorbing_man.sql'), 'utf8'))
  database.exec(
    `insert into user (id, name, email, emailVerified, createdAt, updatedAt) values ('seen', 'Seen', 'seen@example.com', 0, 1, 1), ('unseen', 'Unseen', 'unseen@example.com', 0, 1, 1)`,
  )
  database.exec(`insert into session (id, expiresAt, token, createdAt, updatedAt, userId, impersonatedBy) values
    ('own', 9999999999999, 'own-token', 1000, 2000, 'seen', null),
    ('support', 9999999999999, 'support-token', 3000, 4000, 'seen', 'some-admin'),
    ('supported', 9999999999999, 'supported-token', 3000, 4000, 'unseen', 'some-admin')`)
  database.close()
  migrateAuthSqlite(file)
  const migrated = new DatabaseSync(file, { readOnly: true })
  try {
    expect(
      migrated
        .prepare('select id, lastSeenAt from user order by id')
        .all()
        .map((row) => ({ ...row })),
    ).toEqual([
      { id: 'seen', lastSeenAt: 2000 },
      { id: 'unseen', lastSeenAt: null },
    ])
  } finally {
    migrated.close()
  }
})

it('adds the sponsor table to an auth database that already has OAuth tables', async () => {
  const file = path.join(directory, 'oauth-auth.sqlite')
  const database = new DatabaseSync(file)
  database.exec(await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  database.exec(await readFile(path.resolve('drizzle-auth/0001_sad_absorbing_man.sql'), 'utf8'))
  database.close()
  migrateAuthSqlite(file)
  const migrated = new DatabaseSync(file, { readOnly: true })
  try {
    expect(
      migrated.prepare("select count(*) as count from sqlite_master where type = 'table' and name = 'githubSponsor'").get()?.count,
    ).toBe(1)
  } finally {
    migrated.close()
  }
})

it('imports the auth schema, handles concurrent sign-ups, and restores sessions and signing keys', async () => {
  const count = Number(process.env.AUTH_TEST_SIGNUPS ?? 6)
  const dump = path.join(directory, 'auth-schema.sql')
  const source = path.join(directory, 'auth.sqlite')
  const copy = path.join(directory, 'backup.sqlite')
  await writeFile(dump, await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  await importAuthSqlite(dump, source)
  const { client, database, auth } = authFor(source)
  const created = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      auth.api.signUpEmail({
        body: { email: `node-${index}@example.com`, password: 'password1234', name: `Node ${index}` },
        returnHeaders: true,
      }),
    ),
  )
  const rows = await database.select({ role: user.role }).from(user)
  expect({ users: rows.length, admins: rows.filter((row) => row.role === 'admin').length }).toEqual({ users: count, admins: 1 })
  const cookie = created[0]!.headers.get('set-cookie')?.split(';')[0]
  if (!cookie) throw new Error('Sign-up did not create a session')
  const headers = new Headers({ cookie })
  const before = await auth.api.getSession({ headers })
  const jwks = await auth.api.getJwks()
  expect(jwks.keys).toHaveLength(1)
  const sourceCounts = verifyAuthSqlite(source)
  expect(sourceCounts).toMatchObject({ user: count, session: count, jwks: 1 })
  expect(await backupAuthSqlite(source, copy)).toEqual(sourceCounts)
  client.close()
  const restored = authFor(copy)
  expect((await restored.auth.api.getSession({ headers }))?.user.id).toBe(before?.user.id)
  expect(await restored.auth.api.getJwks()).toEqual(jwks)
  restored.client.close()
})

it('accepts simultaneous sign-ups from two separate app processes', async () => {
  const dump = path.join(directory, 'process-auth-schema.sql')
  const file = path.join(directory, 'process-auth.sqlite')
  await writeFile(dump, await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  await importAuthSqlite(dump, file)
  const script = `
    import { localAuthDatabase } from './src/server/localAuthDatabase.ts'
    import { createSqliteAuth } from './src/server/sqliteAuth.ts'
    const local = localAuthDatabase(process.env.AUTH_REPLICA_FILE)
    const auth = createSqliteAuth(local.database, process.env.AUTH_REPLICA_SECRET, {
      environment: { APP_URL: 'https://praetorium.gg', AUTH_RATE_LIMIT: 'off', SPACETIME_AUDIENCE: 'praetorium-test' },
      deleteUserData: async () => {},
      revokeSessionAccess: async () => {},
      storeSocialAvatar: async () => null,
      updateProfile: async (data) => ({ ok: true, data }),
    })
    const created = await Promise.all(Array.from({ length: 10 }, (_, index) => auth.api.signUpEmail({
      body: { email: 'process-' + process.env.AUTH_REPLICA_INDEX + '-' + index + '@example.com', password: 'password1234', name: 'Replica ' + index },
      returnHeaders: true,
    })))
    process.stdout.write(JSON.stringify({ cookie: created[0].headers.get('set-cookie')?.split(';')[0], userId: created[0].response.user.id }))
    local.client.close()
  `
  const run = (index: number) =>
    execFile(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
      cwd: path.resolve('.'),
      env: { ...process.env, AUTH_REPLICA_FILE: file, AUTH_REPLICA_SECRET: secret, AUTH_REPLICA_INDEX: String(index) },
      timeout: 30_000,
    })
  const [first] = await Promise.all([run(0), run(1)])
  const session = JSON.parse(first.stdout) as { cookie: string; userId: string }
  const local = authFor(file)
  try {
    const roles = await local.database.select({ role: user.role }).from(user)
    const shared = await local.auth.api.getSession({ headers: new Headers({ cookie: session.cookie }) })
    expect({ users: roles.length, admins: roles.filter((row) => row.role === 'admin').length, sessionUserId: shared?.user.id }).toEqual({
      users: 20,
      admins: 1,
      sessionUserId: session.userId,
    })
  } finally {
    local.client.close()
  }
})

it('rejects an invalid dump without leaving a database behind', async () => {
  const dump = path.join(directory, 'invalid.sql')
  const target = path.join(directory, 'invalid.sqlite')
  await writeFile(dump, 'create table user (id text);')
  await expect(importAuthSqlite(dump, target)).rejects.toThrow('Auth SQLite is missing session')
  await expect(importAuthSqlite(dump, target)).rejects.toThrow('Auth SQLite is missing session')
})
