import { databaseUrl, describeDatabase, openDatabase } from '../src/db/connection'

/**
 * Brings the schema up to date, then exits.
 *
 * A step of its own rather than something the app does on the way up: a replica
 * must never serve a request against a schema that is still moving, and the
 * advisory lock inside means several of them starting together take turns
 * instead of racing.
 */
const url = databaseUrl()
const connection = openDatabase(url)
try {
  await connection.migrate()
  console.log({ event: 'database_migrated', database: describeDatabase(url) })
} finally {
  await connection.close()
}
