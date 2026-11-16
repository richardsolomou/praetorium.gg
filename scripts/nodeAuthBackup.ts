import { hash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzipSync, zipSync } from 'fflate'
import { privateR2Client } from '../src/server/r2Client.ts'
import { backupAuthSqlite, verifyAuthSqlite } from './nodeAuthSqlite.ts'
import { isEntryPoint } from './lib/entryPoint.ts'
import { authArchiveKey, prunableAuthArchives } from './lib/authBackupRetention.ts'
import { requiredEnv } from './lib/requiredEnv.ts'
import { isSpacetimeInternalHost } from './lib/spacetimeInternalHost.ts'

const archivePrefix = 'backups/auth/production/'
const pointerKey = `${archivePrefix}latest.json`
const pointerFormat = 'praetorium.auth-backup-pointer.v1'
const maxArchiveBytes = 128 * 1024 * 1024

type R2 = ReturnType<typeof configuredR2>

function configuredR2() {
  const r2 = privateR2Client()
  if (!r2) throw new Error('R2 backup credentials are required')
  return r2
}

async function r2Request(r2: R2, url: string, init: RequestInit = {}) {
  const response = await r2.client.fetch(url, { ...init, signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`R2 auth backup ${init.method ?? 'GET'} failed with HTTP ${response.status}`)
  return response
}

async function archiveKeys(r2: R2) {
  const keys: string[] = []
  const query = new URLSearchParams({ 'list-type': '2', prefix: archivePrefix })
  for (;;) {
    const listing = await (await r2Request(r2, `${r2.base}?${query}`)).text()
    keys.push(...[...listing.matchAll(/<Key>([^<]+)<\/Key>/g)].map((match) => match[1]!))
    if (!listing.includes('<IsTruncated>true</IsTruncated>')) return keys
    const token = /<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(listing)?.[1]
    if (!token) throw new Error('R2 auth backup listing is incomplete')
    query.set('continuation-token', token)
  }
}

async function pruneAuthArchives(r2: R2, written: string) {
  const internalHost = requiredEnv('SPACETIME_INTERNAL_HOST')
  if (!isSpacetimeInternalHost(internalHost)) throw new Error('Invalid SpacetimeDB internal host')
  const product = (await (await r2Request(r2, `${r2.base}${internalHost}/backups/latest.json`)).json()) as { createdAt?: string }
  const spacetimeCreatedAt = new Date(product.createdAt ?? Number.NaN)
  if (Number.isNaN(spacetimeCreatedAt.getTime())) throw new Error('Product backup pointer has no creation time')
  const prunable = prunableAuthArchives(await archiveKeys(r2), { now: new Date(), written, spacetimeCreatedAt })
  for (let start = 0; start < prunable.length; start += 16) {
    await Promise.all(prunable.slice(start, start + 16).map((key) => r2Request(r2, `${r2.base}${key}`, { method: 'DELETE' })))
  }
  return prunable.length
}

async function restoreAuthArchive(bytes: Uint8Array, target: string) {
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
  if (manifest.format !== 'praetorium.auth-backup.v1' || manifest.sha256 !== hash('sha256', database) || secret.byteLength < 32)
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
          JSON.stringify({ format: 'praetorium.auth-backup.v1', sha256: hash('sha256', database), counts }),
        ),
      },
      { level: 1 },
    )
    if (archive.byteLength > maxArchiveBytes) throw new Error('Auth archive is too large')
    const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').slice(0, 15) + 'Z'
    const key = `${archivePrefix}${stamp}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}.zip`
    const url = `${r2.base}${key}`
    await r2Request(r2, url, { method: 'PUT', body: new Uint8Array(archive), headers: { 'content-type': 'application/zip' } })
    const downloaded = await r2Request(r2, url)
    const readback = new Uint8Array(await downloaded.arrayBuffer())
    if (hash('sha256', readback) !== hash('sha256', archive)) throw new Error('R2 auth backup readback did not match')
    await restoreAuthArchive(readback, path.join(work, 'restored'))
    // Only a verified archive becomes the pointer, which restores read instead of choosing a key by name.
    const pointer = { format: pointerFormat, createdAt: new Date().toISOString(), key, sha256: hash('sha256', archive) }
    await r2Request(r2, `${r2.base}${pointerKey}`, {
      method: 'PUT',
      body: JSON.stringify(pointer),
      headers: { 'content-type': 'application/json' },
    })
    return { key, counts, pruned: await pruneAuthArchives(r2, key) }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

/** Restores `key`, or with `latest` the archive the pointer names after checking its digest. */
export async function restoreAuthFromR2(key: string, target: string) {
  if (key !== 'latest' && !authArchiveKey.test(key)) throw new Error('Invalid auth backup key')
  const r2 = configuredR2()
  const pointer =
    key === 'latest'
      ? ((await (await r2Request(r2, `${r2.base}${pointerKey}`)).json()) as { format?: string; key?: string; sha256?: string })
      : undefined
  if (pointer && (pointer.format !== pointerFormat || !authArchiveKey.test(pointer.key ?? '')))
    throw new Error('Invalid auth backup pointer')
  const bytes = new Uint8Array(await (await r2Request(r2, `${r2.base}${pointer?.key ?? key}`)).arrayBuffer())
  if (pointer && hash('sha256', bytes) !== pointer.sha256) throw new Error('Auth archive does not match the pointer')
  return restoreAuthArchive(bytes, target)
}

const [, , command, first, second] = process.argv
if (isEntryPoint(import.meta.url)) {
  if (!first || !second) throw new Error('Usage: nodeAuthBackup.ts backup SQLITE_PATH production | restore R2_KEY|latest TARGET_DIRECTORY')
  const result =
    command === 'backup' && second === 'production'
      ? await backupAuthToR2(first)
      : command === 'restore'
        ? await restoreAuthFromR2(first, second)
        : undefined
  if (!result) throw new Error('Invalid auth backup command')
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
