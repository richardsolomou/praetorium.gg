import { createHash, randomUUID } from 'node:crypto'
import { chmod, link, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { DatabaseSync, backup } from 'node:sqlite'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'
import { r2Client } from '../src/server/r2Client.ts'

const requiredTables = ['user', 'session', 'account', 'verification', 'twoFactor', 'rateLimit', 'jwks']
const importKey = /^backups\/auth\/import\/(staging|production)\/([0-9a-f]{64})\.sql\.gz$/
const maxImportBytes = 128 * 1024 * 1024

export function verifyAuthSqlite(file: string) {
  const database = new DatabaseSync(file, { readOnly: true })
  try {
    if (database.prepare('pragma integrity_check').get()?.integrity_check !== 'ok') throw new Error('Auth SQLite integrity check failed')
    const tables = new Set(
      database
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map((row) => String(row.name)),
    )
    for (const name of requiredTables) {
      if (!tables.has(name)) throw new Error(`Auth SQLite is missing ${name}`)
    }
    return Object.fromEntries(
      requiredTables.map((name) => [name, Number(database.prepare(`select count(*) as count from "${name}"`).get()?.count)]),
    )
  } finally {
    database.close()
  }
}

export async function importAuthSqlite(dump: string, target: string) {
  if (!path.isAbsolute(target)) throw new Error('Auth SQLite target must be absolute')
  await stat(target).then(
    () => {
      throw new Error('Auth SQLite target already exists')
    },
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    },
  )
  const temporary = `${target}.${crypto.randomUUID()}.tmp`
  const database = new DatabaseSync(temporary)
  try {
    await chmod(temporary, 0o600)
    database.exec(await readFile(dump, 'utf8'))
    database.exec('pragma journal_mode = wal')
  } catch (error) {
    database.close()
    await rm(temporary, { force: true })
    throw error
  }
  database.close()
  try {
    const counts = verifyAuthSqlite(temporary)
    await rename(temporary, target)
    return counts
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function backupAuthSqlite(source: string, target: string) {
  if (!path.isAbsolute(source) || !path.isAbsolute(target)) throw new Error('Auth SQLite backup paths must be absolute')
  await stat(target).then(
    () => {
      throw new Error('Auth SQLite backup target already exists')
    },
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    },
  )
  const sourceDatabase = new DatabaseSync(source, { readOnly: true })
  try {
    await backup(sourceDatabase, target)
    await chmod(target, 0o600)
    return verifyAuthSqlite(target)
  } catch (error) {
    await rm(target, { force: true })
    throw error
  } finally {
    sourceDatabase.close()
  }
}

export async function importAuthDumpFromR2(key: string, target: string) {
  const match = importKey.exec(key)
  if (!match) throw new Error('Invalid auth import key')
  if (!path.isAbsolute(target)) throw new Error('Auth SQLite target must be absolute')
  await stat(target).then(
    () => {
      throw new Error('Auth SQLite target already exists')
    },
    (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    },
  )
  const r2 = r2Client()
  if (!r2) throw new Error('R2 import credentials are required')
  const response = await r2.client.fetch(`${r2.base}${key}`, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`R2 auth import download failed with HTTP ${response.status}`)
  const compressed = new Uint8Array(await response.arrayBuffer())
  if (compressed.byteLength > maxImportBytes || createHash('sha256').update(compressed).digest('hex') !== match[2]) {
    throw new Error('Auth import archive failed verification')
  }
  const dump = `${target}.${randomUUID()}.sql`
  const imported = `${target}.${randomUUID()}.imported`
  try {
    await writeFile(dump, gunzipSync(compressed, { maxOutputLength: maxImportBytes }), { mode: 0o600, flag: 'wx' })
    const counts = await importAuthSqlite(dump, imported)
    if (match[1] === 'production' && counts.user === 0) throw new Error('Production auth import is empty')
    try {
      await link(imported, target)
      return counts
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      return verifyAuthSqlite(target)
    }
  } finally {
    await Promise.all([dump, imported].map((file) => rm(file, { force: true })))
  }
}

export async function uploadD1AuthDumpToR2(dump: string, environment: 'staging' | 'production') {
  const r2 = r2Client()
  if (!r2) throw new Error('R2 import credentials are required')
  const contents = await readFile(dump)
  if (contents.byteLength > maxImportBytes) throw new Error('Auth export is too large')
  const work = await mkdtemp(path.join(os.tmpdir(), 'praetorium-auth-import-'))
  try {
    const counts = await importAuthSqlite(dump, path.join(work, 'auth.sqlite'))
    if (environment === 'production' && counts.user === 0) throw new Error('Production auth import is empty')
    const compressed = gzipSync(contents)
    const hash = createHash('sha256').update(compressed).digest('hex')
    const key = `backups/auth/import/${environment}/${hash}.sql.gz`
    const url = `${r2.base}${key}`
    const uploaded = await r2.client.fetch(url, {
      method: 'PUT',
      body: new Uint8Array(compressed),
      headers: { 'content-type': 'application/gzip' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!uploaded.ok) throw new Error(`R2 auth import upload failed with HTTP ${uploaded.status}`)
    const downloaded = await r2.client.fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!downloaded.ok) throw new Error(`R2 auth import readback failed with HTTP ${downloaded.status}`)
    if (
      createHash('sha256')
        .update(new Uint8Array(await downloaded.arrayBuffer()))
        .digest('hex') !== hash
    ) {
      throw new Error('R2 auth import readback did not match')
    }
    return { key, counts }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

const [, , command, first, second] = process.argv
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!first || (command !== 'verify' && !second))
    throw new Error('Usage: nodeAuthSqlite.ts import|import-r2|upload-r2|backup|verify SOURCE [TARGET]')
  const result =
    command === 'import'
      ? await importAuthSqlite(first, second!)
      : command === 'import-r2'
        ? await importAuthDumpFromR2(first, second!)
        : command === 'upload-r2' && (second === 'staging' || second === 'production')
          ? await uploadD1AuthDumpToR2(first, second)
          : command === 'backup'
            ? await backupAuthSqlite(first, second!)
            : command === 'verify'
              ? verifyAuthSqlite(first)
              : undefined
  if (!result) throw new Error('Unknown auth SQLite command')
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
