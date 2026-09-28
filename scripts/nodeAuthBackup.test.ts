import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { backupAuthToR2, restoreAuthFromR2 } from './nodeAuthBackup'
import { importAuthSqlite } from './nodeAuthSqlite'

let directory: string
const previousSecret = process.env.AUTH_SECRET

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'praetorium-auth-r2-'))
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.R2_ACCOUNT_ID
  delete process.env.R2_ACCESS_KEY_ID
  delete process.env.R2_SECRET_ACCESS_KEY
  if (previousSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = previousSecret
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

it('uploads a consistent auth snapshot and secret to R2 and restores the downloaded archive', async () => {
  const dump = path.join(directory, 'auth-schema.sql')
  const source = path.join(directory, 'auth.sqlite')
  const restored = path.join(directory, 'restored')
  await writeFile(dump, await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  await importAuthSqlite(dump, source)
  process.env.AUTH_SECRET = 'production-auth-secret-preserved-in-backup'
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  let stored: Uint8Array | undefined
  const urls: string[] = []
  vi.stubGlobal('fetch', async (request: Request) => {
    urls.push(request.url)
    if (request.method === 'PUT') {
      stored = new Uint8Array(await request.arrayBuffer())
      return new Response(null, { status: 200 })
    }
    return new Response(stored ? new Uint8Array(stored) : null, { status: stored ? 200 : 404 })
  })
  const { key, counts } = await backupAuthToR2(source)
  expect(key).toMatch(/^backups\/auth\/production\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.zip$/)
  expect(urls.every((url) => new URL(url).pathname.startsWith('/praetorium/backups/auth/production/'))).toBe(true)
  expect(await restoreAuthFromR2(key, restored)).toEqual(counts)
  expect(await readFile(path.join(restored, 'auth-secret'), 'utf8')).toBe(process.env.AUTH_SECRET)
})

it('rejects another backup key before making a request', async () => {
  await expect(restoreAuthFromR2('backups/other/private.zip', path.join(directory, 'bad'))).rejects.toThrow('Invalid auth backup key')
})

it('rejects retired staging backups', async () => {
  await expect(
    restoreAuthFromR2('backups/auth/staging/20260927T201947Z-1113929dbf254cb9.zip', path.join(directory, 'staging')),
  ).rejects.toThrow('Invalid auth backup key')
})
