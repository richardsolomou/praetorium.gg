import { DatabaseSync } from 'node:sqlite'
import { databaseUrl, describeDatabase, openDatabase } from '../src/db/connection'
import { importSqlite, sqlitePath } from './importSqlite'

// The entrypoint for `just db-import-sqlite`, kept apart from the library so that
// bundling the library somewhere else cannot run this.
const file = sqlitePath()
const url = databaseUrl()
const source = new DatabaseSync(file, { readOnly: true })
const connection = openDatabase(url)
try {
  await connection.migrate()
  const counts = await importSqlite(source, connection.database)
  console.log({ event: 'sqlite_imported', from: file, into: describeDatabase(url) })
  for (const { table, read, written } of counts) {
    const skipped = read - written
    console.log(`  ${table}: read ${read}, wrote ${written}${skipped ? `, already present ${skipped}` : ''}`)
  }
} finally {
  source.close()
  await connection.close()
}
