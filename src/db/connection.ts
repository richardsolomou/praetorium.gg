import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { bundledDirectory } from 'ras-stack/database'
import { schema } from './schema'

/** The Postgres repository's shared type across its legacy integration drivers. */
export type PraetoriumDatabase = PgDatabase<PgQueryResultHKT, typeof schema>

/**
 * An open database and the two things only its driver can do.
 *
 * Migrating and closing are per-driver, so they travel with the connection
 * rather than being re-derived from the database by whoever holds it.
 */
export type PraetoriumConnection = {
  database: PraetoriumDatabase
  migrate: () => Promise<void>
  close: () => Promise<void>
}

/** Find the migrations used by PGlite integration tests. */
export const migrationsFolder = () =>
  bundledDirectory({
    developmentUrl: new URL('../../drizzle', import.meta.url),
    production: process.env.NODE_ENV === 'production',
    name: 'drizzle',
  })
