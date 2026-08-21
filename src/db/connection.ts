import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { bundledDirectory, databaseTarget } from 'ras-stack/database'
import { closeDrizzlePostgres, migrateDrizzlePostgres, openDrizzlePostgres, redactedPostgresUrl } from 'ras-stack/database/postgres'
import { schema } from './schema'

/**
 * Any Postgres drizzle holds, named at the widest type that still knows the schema.
 *
 * Production talks to a server over `postgres-js`; the unit suites run the same
 * SQL against an in-process Postgres. Naming one driver here would fork the
 * repository into two implementations of every query, which is the thing this
 * layer exists to prevent.
 */
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

/*
 * The migrations, wherever this happens to be running from.
 *
 * Read from the environment rather than `import.meta.env`, because three
 * different bundlers reach this file: Vite builds the server, esbuild builds the
 * standalone migrate step, and `tsx` runs it straight from source. Only the first
 * would define `import.meta.env`, and the other two would fault on it.
 */
const migrationsFolder = bundledDirectory({
  developmentUrl: new URL('../../drizzle', import.meta.url),
  production: process.env.NODE_ENV === 'production',
  name: 'drizzle',
})

/**
 * The Postgres this instance owns.
 *
 * Unset is a configuration error rather than a default: guessing a local server
 * would let a deployment come up pointing at nothing and call itself healthy.
 */
export function databaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  // Resolved through ras-stack so the protocol is checked here rather than
  // becoming a confusing connection error later.
  const target = databaseTarget({ databaseUrl: environment.DATABASE_URL, sqliteFile: '' })
  if (target.provider !== 'postgres') throw new Error('DATABASE_URL is not set. Praetorium needs a Postgres connection string.')
  return target.url
}

/**
 * Names the migration itself, so replicas booting together take turns.
 *
 * Any constant would do; it only has to be the same one everywhere.
 */
const MIGRATION_LOCK = 4_021_970_611

export function openDatabase(url: string): PraetoriumConnection {
  const connection = openDrizzlePostgres({
    url,
    schema,
    // Every request that reads a battle folds its log, so connections are taken
    // briefly and often. Ten per replica keeps the pool from becoming the queue.
    client: { max: Number(process.env.DATABASE_POOL_MAX ?? 10) },
  })
  return {
    database: connection.database,
    /*
     * Migrating under an advisory lock, because more than one replica may boot
     * at once and they would otherwise each try to apply the same migration.
     *
     * The lock is held on a reserved connection rather than a pooled one: an
     * advisory lock belongs to a session, so taking it and releasing it on two
     * different connections out of the pool would release nothing.
     */
    migrate: async () => {
      const held = await connection.client.reserve()
      try {
        await held`select pg_advisory_lock(${MIGRATION_LOCK})`
        await migrateDrizzlePostgres(connection, migrationsFolder)
      } finally {
        await held`select pg_advisory_unlock(${MIGRATION_LOCK})`
        held.release()
      }
    },
    close: () => closeDrizzlePostgres(connection),
  }
}

/** Safe to log: the connection string without its credentials. */
export function describeDatabase(url: string) {
  return redactedPostgresUrl(url)
}

export { migrationsFolder }
