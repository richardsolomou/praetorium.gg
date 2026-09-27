import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { importAuthDumpFromR2, uploadD1AuthDumpToR2, verifyAuthSqlite } from './nodeAuthSqlite'

let directory: string
const saved = Object.fromEntries(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'].map((key) => [key, process.env[key]]))

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'praetorium-auth-import-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

it('verifies and imports a populated production D1 export from R2', async () => {
  const schema = await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8')
  const dump = `${schema}\nINSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES ('one', 'One', 'one@example.com', 1, 1, 1);\n`
  const compressed = gzipSync(dump)
  const hash = createHash('sha256').update(compressed).digest('hex')
  const key = `backups/auth/import/production/${hash}.sql.gz`
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  vi.stubGlobal('fetch', async () => new Response(compressed, { status: 200 }))
  const target = path.join(directory, 'production.sqlite')
  expect(await importAuthDumpFromR2(key, target)).toMatchObject({ user: 1 })
  await expect(importAuthDumpFromR2(key, target)).rejects.toThrow()
})

it('uploads a verified staging export and reads it back before use', async () => {
  const dump = path.join(directory, 'staging.sql')
  await writeFile(dump, await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql')))
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  let stored: Uint8Array | undefined
  vi.stubGlobal('fetch', async (request: Request) => {
    if (request.method === 'PUT') {
      stored = new Uint8Array(await request.arrayBuffer())
      return new Response(null, { status: 200 })
    }
    return new Response(stored ? new Uint8Array(stored) : null, { status: stored ? 200 : 404 })
  })
  const uploaded = await uploadD1AuthDumpToR2(dump, 'staging')
  const imported = await importAuthDumpFromR2(uploaded.key, path.join(directory, 'staging.sqlite'))
  expect({ key: uploaded.key, uploaded: uploaded.counts, imported }).toMatchObject({
    key: expect.stringMatching(/^backups\/auth\/import\/staging\/[0-9a-f]{64}\.sql\.gz$/),
    uploaded: { user: 0, session: 0, jwks: 0 },
    imported: { user: 0, session: 0, jwks: 0 },
  })
})

it('lets simultaneous replicas install the same verified auth export', async () => {
  const compressed = gzipSync(await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql')))
  const hash = createHash('sha256').update(compressed).digest('hex')
  const key = `backups/auth/import/staging/${hash}.sql.gz`
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  let requests = 0
  let release!: () => void
  const bothRequested = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.stubGlobal('fetch', async () => {
    if (++requests === 2) release()
    await bothRequested
    return new Response(compressed, { status: 200 })
  })
  const target = path.join(directory, 'shared.sqlite')
  const [first, second] = await Promise.all([importAuthDumpFromR2(key, target), importAuthDumpFromR2(key, target)])
  expect([first, second]).toEqual([verifyAuthSqlite(target), verifyAuthSqlite(target)])
})

it('rejects a changed export without installing an auth database', async () => {
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  vi.stubGlobal('fetch', async () => new Response(gzipSync('changed'), { status: 200 }))
  await expect(
    importAuthDumpFromR2(`backups/auth/import/production/${'b'.repeat(64)}.sql.gz`, path.join(directory, 'changed.sqlite')),
  ).rejects.toThrow('Auth import archive failed verification')
})

it('rejects an empty production export', async () => {
  const compressed = gzipSync(await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql')))
  const hash = createHash('sha256').update(compressed).digest('hex')
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  vi.stubGlobal('fetch', async () => new Response(compressed, { status: 200 }))
  await expect(importAuthDumpFromR2(`backups/auth/import/production/${hash}.sql.gz`, path.join(directory, 'empty.sqlite'))).rejects.toThrow(
    'Production auth import is empty',
  )
})
