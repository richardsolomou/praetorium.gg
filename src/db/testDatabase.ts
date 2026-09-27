import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { migrationsFolder, type PraetoriumConnection } from './connection'
import { schema } from './schema'

/** The legacy repository's Postgres integration database, in process. */
export async function openTestDatabase(): Promise<PraetoriumConnection> {
  const client = new PGlite()
  const database = drizzle(client, { schema })
  const connection: PraetoriumConnection = {
    database,
    migrate: () => migrate(database, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
  }
  await connection.migrate()
  return connection
}
