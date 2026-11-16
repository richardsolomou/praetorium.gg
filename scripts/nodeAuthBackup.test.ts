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
  delete process.env.SPACETIME_INTERNAL_HOST
  if (previousSecret === undefined) delete process.env.AUTH_SECRET
  else process.env.AUTH_SECRET = previousSecret
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

const oldDay = ['20261001T010000Z-aaaaaaaaaaaaaaaa.zip', '20261001T020000Z-bbbbbbbbbbbbbbbb.zip'].map(
  (name) => `backups/auth/production/${name}`,
)

async function backUpToStubbedR2() {
  const dump = path.join(directory, 'auth-schema.sql')
  const source = path.join(directory, 'auth.sqlite')
  await writeFile(dump, await readFile(path.resolve('drizzle-auth/0000_curly_gambit.sql'), 'utf8'))
  await rm(source, { force: true })
  await importAuthSqlite(dump, source)
  process.env.AUTH_SECRET = 'production-auth-secret-preserved-in-backup'
  process.env.R2_ACCOUNT_ID = 'a'.repeat(32)
  process.env.R2_ACCESS_KEY_ID = 'key'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  process.env.SPACETIME_INTERNAL_HOST = 'spacetime-production'
  const objects = new Map<string, Uint8Array>([
    ...oldDay.map((key) => [key, new Uint8Array([1])] as const),
    ['spacetime-production/backups/latest.json', new TextEncoder().encode(JSON.stringify({ createdAt: new Date().toISOString() }))],
  ])
  vi.stubGlobal('fetch', async (request: Request) => {
    const url = new URL(request.url)
    const key = url.pathname.replace('/praetorium-private/', '')
    if (url.searchParams.get('list-type') === '2') {
      const keys = [...objects.keys()].filter((stored) => stored.startsWith(url.searchParams.get('prefix')!))
      return new Response(
        `<ListBucketResult>${keys.map((stored) => `<Contents><Key>${stored}</Key></Contents>`).join('')}<IsTruncated>false</IsTruncated></ListBucketResult>`,
      )
    }
    if (request.method === 'PUT') objects.set(key, new Uint8Array(await request.arrayBuffer()))
    if (request.method === 'DELETE') objects.delete(key)
    if (request.method !== 'GET') return new Response(null, { status: 200 })
    const stored = objects.get(key)
    return new Response(stored ? new Uint8Array(stored) : null, { status: stored ? 200 : 404 })
  })
  return { ...(await backupAuthToR2(source)), objects }
}

it('uploads a consistent auth snapshot and secret to R2 and restores the downloaded archive', async () => {
  const { key, counts } = await backUpToStubbedR2()
  expect(await restoreAuthFromR2(key, path.join(directory, 'restored'))).toEqual(counts)
})

it('restores the archive the latest pointer names', async () => {
  const { counts } = await backUpToStubbedR2()
  expect(await restoreAuthFromR2('latest', path.join(directory, 'restored-latest'))).toEqual(counts)
})

it('refuses an archive that no longer matches the latest pointer', async () => {
  const { key, objects } = await backUpToStubbedR2()
  objects.set(key, new Uint8Array([...objects.get(key)!, 0]))
  await expect(restoreAuthFromR2('latest', path.join(directory, 'restored-changed'))).rejects.toThrow(
    'Auth archive does not match the pointer',
  )
})

it('keeps the auth secret in the archive', async () => {
  await backUpToStubbedR2()
  await restoreAuthFromR2('latest', path.join(directory, 'restored-secret'))
  expect(await readFile(path.join(directory, 'restored-secret', 'auth-secret'), 'utf8')).toBe(process.env.AUTH_SECRET)
})

it('prunes older archives of a day after publishing the new one', async () => {
  const { objects } = await backUpToStubbedR2()
  expect(oldDay.filter((key) => objects.has(key))).toEqual([oldDay[1]])
})

it('rejects another backup key before making a request', async () => {
  await expect(restoreAuthFromR2('backups/other/private.zip', path.join(directory, 'bad'))).rejects.toThrow('Invalid auth backup key')
})

it('rejects retired staging backups', async () => {
  await expect(
    restoreAuthFromR2('backups/auth/staging/20260927T201947Z-1113929dbf254cb9.zip', path.join(directory, 'staging')),
  ).rejects.toThrow('Invalid auth backup key')
})
