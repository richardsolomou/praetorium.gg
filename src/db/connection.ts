import Database from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { schema } from './schema'

export type MusterDatabase = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

const migrationsFolder = import.meta.env.PROD
  ? path.join(path.dirname(process.argv[1]), 'drizzle')
  : fileURLToPath(new URL('../../drizzle', import.meta.url))

export function openDatabase(file: string): MusterDatabase {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true })
  const database = drizzle({ client: new Database(file), schema })
  database.run(sql`PRAGMA journal_mode = WAL`)
  database.run(sql`PRAGMA synchronous = FULL`)
  database.run(sql`PRAGMA busy_timeout = 5000`)
  database.run(sql`PRAGMA foreign_keys = ON`)
  migrate(database, { migrationsFolder })
  return database
}

export function closeDatabase(database: MusterDatabase) {
  database.$client.close()
}

export function databasePath(dataDirectory = process.env.DATA_DIR ?? '/data') {
  return path.join(path.resolve(dataDirectory), 'muster.sqlite')
}
