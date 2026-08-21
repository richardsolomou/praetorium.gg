import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { migrationsFolder, type PraetoriumConnection } from './connection'
import { schema } from './schema'

/**
 * A real Postgres for the unit suites, in this process.
 *
 * PGlite is Postgres compiled to WebAssembly, so the tests run the same SQL and
 * the same migrations as a deployment rather than a dialect that merely looks
 * like it. Nothing here reaches production; `pnpm test` needs no server.
 */
export async function openTestDatabase(): Promise<PraetoriumConnection> {
  const client = new PGlite()
  const database = drizzle(client, { schema })
  const connection: PraetoriumConnection = {
    database,
    migrate: () => migrate(database, { migrationsFolder }),
    close: () => client.close(),
  }
  await connection.migrate()
  return connection
}
