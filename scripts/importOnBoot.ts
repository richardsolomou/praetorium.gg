import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { count } from 'drizzle-orm'
import { databaseUrl, describeDatabase, openDatabase, type PraetoriumDatabase } from '../src/db/connection'
import { user } from '../src/db/schema'
import { type ImportCount, importSqlite, sqlitePath } from './importSqlite'

/**
 * Carries a SQLite deployment into Postgres, once, on the boot that needs it.
 *
 * Transitional. This file, `importSqlite.ts`, their tests, the call in
 * `containerRuntime.ts`, the two esbuild entries and the `db:import-sqlite`
 * script all go once production has been through the cutover, leaving Postgres
 * as the only lane.
 *
 * The cutover is otherwise a step an operator has to remember between pointing
 * `DATABASE_URL` at an empty Postgres and players finding their accounts gone.
 *
 * Having no accounts is the whole condition, which makes this self-disabling: the
 * first boot imports, and every boot after it finds accounts and does nothing.
 * Two replicas booting together can both decide to import, and that is harmless
 * because the copy skips rows that are already there.
 */
export async function importIfEmpty(source: DatabaseSync, database: PraetoriumDatabase): Promise<ImportCount[] | null> {
  const [existing] = await database.select({ accounts: count() }).from(user)
  if ((existing?.accounts ?? 0) > 0) return null
  return importSqlite(source, database)
}

async function accountCount(database: PraetoriumDatabase) {
  const [row] = await database.select({ accounts: count() }).from(user)
  return row?.accounts ?? 0
}

function sqliteAccountCount(source: DatabaseSync) {
  try {
    const row = source.prepare('select count(*) as accounts from "user"').get() as { accounts: number } | undefined
    return row?.accounts ?? 0
  } catch {
    // An older database without the table. Reported as unknown rather than zero.
    return null
  }
}

export async function importOnBoot() {
  const file = sqlitePath(undefined)
  // Nothing to carry across on an instance that was always Postgres.
  if (!fs.existsSync(file)) return
  const url = databaseUrl()
  const connection = openDatabase(url)
  const source = new DatabaseSync(file, { readOnly: true })
  try {
    const counts = await importIfEmpty(source, connection.database)
    if (!counts) {
      /*
       * Both counts, because the only way this is the wrong answer is a Postgres
       * that already held something. One account here against many there is the
       * signature of a cutover that skipped, and it says so rather than coming up
       * quietly empty. The SQLite file is opened read-only and never removed, so
       * that case is recoverable: empty the database and deploy again.
       */
      console.log({
        event: 'sqlite_import_skipped',
        reason: 'postgres already holds accounts',
        from: file,
        postgresAccounts: await accountCount(connection.database),
        sqliteAccounts: sqliteAccountCount(source),
      })
      return
    }
    console.log({ event: 'sqlite_imported', from: file, into: describeDatabase(url) })
    for (const { table, read, written } of counts) console.log(`  ${table}: read ${read}, wrote ${written}`)
  } finally {
    source.close()
    await connection.close()
  }
}

// An entrypoint, not a library: a main block runs inside any bundle that includes
// the file, because esbuild gives every module the entrypoint's `import.meta.url`.
if (import.meta.url === `file://${process.argv[1]}`) await importOnBoot()
