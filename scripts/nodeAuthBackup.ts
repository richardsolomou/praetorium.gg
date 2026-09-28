import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import { privateR2Client } from '../src/server/r2Client.ts'
import { backupAuthSqlite, verifyAuthSqlite } from './nodeAuthSqlite.ts'

const archiveKey = /^backups\/auth\/production\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{16}\.zip$/
const maxArchiveBytes = 128 * 1024 * 1024

function digest(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex')
}

function configuredR2() {
  const r2 = privateR2Client()
  if (!r2) throw new Error('R2 backup credentials are required')
  return r2
}

export async function restoreAuthArchive(bytes: Uint8Array, target: string) {
  if (!path.isAbsolute(target)) throw new Error('Auth restore target must be absolute')
  if (bytes.byteLength > maxArchiveBytes) throw new Error('Auth archive is too large')
  let expanded = 0
  let count = 0
  const files = unzipSync(bytes, {
    filter: (entry) => {
      expanded += entry.originalSize
      count++
      if (count > 3 || expanded > maxArchiveBytes || !['auth.sqlite', 'auth-secret', 'manifest.json'].includes(entry.name)) {
        throw new Error('Auth archive contents are invalid')
      }
      return true
    },
  })
  if (Object.keys(files).sort().join(',') !== 'auth-secret,auth.sqlite,manifest.json') throw new Error('Auth archive contents are invalid')
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as { format?: string; sha256?: string }
  const database = files['auth.sqlite']!
  const secret = files['auth-secret']!
  if (manifest.format !== 'praetorium.auth-backup.v1' || manifest.sha256 !== digest(database) || secret.byteLength < 32)
    throw new Error('Auth archive failed verification')
  await mkdir(target, { mode: 0o700 })
  try {
    await writeFile(path.join(target, 'auth.sqlite'), database, { mode: 0o600 })
    await writeFile(path.join(target, 'auth-secret'), secret, { mode: 0o600 })
    return verifyAuthSqlite(path.join(target, 'auth.sqlite'))
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
}

export async function backupAuthToR2(source: string) {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET is required for a restorable backup')
  const r2 = configuredR2()
  const work = await mkdtemp(path.join(os.tmpdir(), 'praetorium-auth-backup-'))
  try {
    const copy = path.join(work, 'auth.sqlite')
    const counts = await backupAuthSqlite(source, copy)
    if ((await stat(copy)).size > maxArchiveBytes) throw new Error('Auth database is too large for backup')
    const database = await readFile(copy)
    const archive = zipSync(
      {
        'auth.sqlite': database,
        'auth-secret': new TextEncoder().encode(secret),
        'manifest.json': new TextEncoder().encode(
          JSON.stringify({ format: 'praetorium.auth-backup.v1', sha256: digest(database), counts }),
        ),
      },
      { level: 1 },
    )
    if (archive.byteLength > maxArchiveBytes) throw new Error('Auth archive is too large')
    const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15) + 'Z'
    const key = `backups/auth/production/${stamp}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}.zip`
    const url = `${r2.base}${key}`
    const uploaded = await r2.client.fetch(url, {
      method: 'PUT',
      body: new Uint8Array(archive),
      headers: { 'content-type': 'application/zip' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!uploaded.ok) throw new Error(`R2 auth backup upload failed with HTTP ${uploaded.status}`)
    const downloaded = await r2.client.fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!downloaded.ok) throw new Error(`R2 auth backup readback failed with HTTP ${downloaded.status}`)
    const readback = new Uint8Array(await downloaded.arrayBuffer())
    if (digest(readback) !== digest(archive)) throw new Error('R2 auth backup readback did not match')
    await restoreAuthArchive(readback, path.join(work, 'restored'))
    return { key, counts }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

export async function restoreAuthFromR2(key: string, target: string) {
  if (!archiveKey.test(key)) throw new Error('Invalid auth backup key')
  const r2 = configuredR2()
  const response = await r2.client.fetch(`${r2.base}${key}`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`R2 auth backup download failed with HTTP ${response.status}`)
  return restoreAuthArchive(new Uint8Array(await response.arrayBuffer()), target)
}

const [, , command, first, second] = process.argv
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!first || !second) throw new Error('Usage: nodeAuthBackup.ts backup SQLITE_PATH production | restore R2_KEY TARGET_DIRECTORY')
  const result =
    command === 'backup' && second === 'production'
      ? await backupAuthToR2(first)
      : command === 'restore'
        ? await restoreAuthFromR2(first, second)
        : undefined
  if (!result) throw new Error('Invalid auth backup command')
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
