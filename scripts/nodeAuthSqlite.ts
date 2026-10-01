import { chmod, readFile, rename, rm, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { DatabaseSync, backup } from 'node:sqlite'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const requiredTables = ['user', 'session', 'account', 'verification', 'twoFactor', 'rateLimit', 'jwks']
const hasTable = (database: DatabaseSync, table: string) =>
  Boolean(database.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table))
const hasColumn = (database: DatabaseSync, table: string, column: string) =>
  database
    .prepare(`select name from pragma_table_info('${table}')`)
    .all()
    .some((row) => row.name === column)

/** Each migration after the first, recognised as applied by what it adds. */
const migrations = [
  {
    file: new URL('../drizzle-auth/0001_sad_absorbing_man.sql', import.meta.url),
    applied: (database: DatabaseSync) => hasTable(database, 'oauthClient'),
  },
  {
    file: new URL('../drizzle-auth/0002_organic_ikaris.sql', import.meta.url),
    applied: (database: DatabaseSync) => hasColumn(database, 'user', 'lastSeenAt'),
  },
]

function applyMigrations(database: DatabaseSync) {
  for (const migration of migrations) if (!migration.applied(database)) database.exec(readFileSync(migration.file, 'utf8'))
}

export function migrateAuthSqlite(file: string) {
  const database = new DatabaseSync(file, { timeout: 5_000 })
  try {
    database.exec('BEGIN IMMEDIATE')
    try {
      applyMigrations(database)
      database.exec('COMMIT')
    } catch (error) {
      database.exec('ROLLBACK')
      throw error
    }
  } finally {
    database.close()
  }
}

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
    // Checked before migrating, so a dump missing a table is named rather than failing inside a migration.
    verifyAuthSqlite(temporary)
    migrateAuthSqlite(temporary)
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

const [, , command, first, second] = process.argv
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!first || (command !== 'verify' && !second)) throw new Error('Usage: nodeAuthSqlite.ts import|backup|verify SOURCE [TARGET]')
  const result =
    command === 'import'
      ? await importAuthSqlite(first, second!)
      : command === 'backup'
        ? await backupAuthSqlite(first, second!)
        : command === 'verify'
          ? verifyAuthSqlite(first)
          : undefined
  if (!result) throw new Error('Unknown auth SQLite command')
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
