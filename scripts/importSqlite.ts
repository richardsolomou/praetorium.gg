import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { getTableName, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { databaseUrl, describeDatabase, openDatabase, type PraetoriumDatabase } from '../src/db/connection'
import {
  account,
  battleUsers,
  battles,
  collection,
  commands,
  favouriteFactions,
  friendships,
  rateLimit,
  rosters,
  session,
  user,
  verification,
} from '../src/db/schema'

/**
 * Moves a SQLite Praetorium into Postgres, once.
 *
 * Transitional, and removed with `importOnBoot.ts` after the cutover.
 *
 * The tables are copied in the order their foreign keys allow, inside one
 * transaction, so a failure anywhere leaves an empty database rather than half a
 * game. Rows keep their ids, so a link a player has already shared still opens
 * the same battle afterwards.
 *
 * Sessions come across for completeness, but they are not what keeps anyone
 * signed in: with Valkey configured, better-auth reads sessions from Valkey
 * alone, so everyone signs in once after the cutover whatever this copies.
 */

type Row = Record<string, unknown>

/**
 * One table, and how a SQLite row of it becomes a Postgres row.
 *
 * The table type stays inside `move`, where the mapper and the table it feeds are
 * declared together and the checker can hold them to each other. Carried out to
 * the list, the two would only be a table and some function.
 */
type Move = {
  from: string
  table: string
  copy: (rows: readonly Row[], tx: PraetoriumDatabase) => Promise<number>
}

/** Large enough to keep the round trips down, small enough to stay inside parameter limits. */
const CHUNK = 500

function move<TTable extends PgTable>(from: string, into: TTable, row: (source: Row) => TTable['$inferInsert']): Move {
  return {
    from,
    table: getTableName(into),
    copy: async (rows, tx) => {
      let written = 0
      for (let index = 0; index < rows.length; index += CHUNK) {
        const values = rows.slice(index, index + CHUNK).map(row)
        if (!values.length) continue
        const inserted = await tx
          .insert(into)
          .values(values)
          .onConflictDoNothing()
          .returning({ marker: sql<number>`1` })
        written += inserted.length
      }
      return written
    },
  }
}

/**
 * A time better-auth wrote, read back as one.
 *
 * SQLite held these as ISO text. Anything that does not parse is a fault to
 * report rather than a date to invent: a wrong timestamp on a session or a token
 * is worse than a migration that stops and says which row it was.
 */
function asDate(value: unknown, column: string): Date {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${column} is not a date: ${JSON.stringify(value)}`)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`${column} is not a date: ${JSON.stringify(value)}`)
  return parsed
}

function asOptionalDate(value: unknown, column: string): Date | null {
  return value === null || value === undefined ? null : asDate(value, column)
}

/**
 * Text, insisted upon rather than coerced.
 *
 * SQLite hands back whatever a column holds, and a roster's picks arriving as
 * "[object Object]" would be a corrupted list that still saved cleanly.
 */
function asText(value: unknown, column: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  throw new Error(`${column} is not text: ${JSON.stringify(value)}`)
}

function asOptionalText(value: unknown, column: string): string | null {
  return value === null || value === undefined ? null : asText(value, column)
}

function asNumber(value: unknown, column: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new Error(`${column} is not a number: ${JSON.stringify(value)}`)
  return parsed
}

function asOptionalNumber(value: unknown, column: string): number | null {
  return value === null || value === undefined ? null : asNumber(value, column)
}

/** SQLite has no boolean; better-auth wrote 0 and 1. */
function asBoolean(value: unknown): boolean {
  return value === 1 || value === true || value === '1'
}

/**
 * Every table, in an order no foreign key objects to.
 *
 * `user` first because almost everything points at it, then the battles a seat
 * needs before it can name one.
 */
export const MOVES = [
  move('user', user, (row) => ({
    id: asText(row.id, 'id'),
    name: asText(row.name, 'name'),
    email: asText(row.email, 'email'),
    emailVerified: asBoolean(row.emailVerified),
    image: asOptionalText(row.image, 'image'),
    createdAt: asDate(row.createdAt, 'user.createdAt'),
    updatedAt: asDate(row.updatedAt, 'user.updatedAt'),
  })),
  move('account', account, (row) => ({
    id: asText(row.id, 'id'),
    accountId: asText(row.accountId, 'accountId'),
    providerId: asText(row.providerId, 'providerId'),
    userId: asText(row.userId, 'userId'),
    accessToken: asOptionalText(row.accessToken, 'accessToken'),
    refreshToken: asOptionalText(row.refreshToken, 'refreshToken'),
    idToken: asOptionalText(row.idToken, 'idToken'),
    accessTokenExpiresAt: asOptionalDate(row.accessTokenExpiresAt, 'account.accessTokenExpiresAt'),
    refreshTokenExpiresAt: asOptionalDate(row.refreshTokenExpiresAt, 'account.refreshTokenExpiresAt'),
    scope: asOptionalText(row.scope, 'scope'),
    password: asOptionalText(row.password, 'password'),
    createdAt: asDate(row.createdAt, 'account.createdAt'),
    updatedAt: asDate(row.updatedAt, 'account.updatedAt'),
  })),
  move('session', session, (row) => ({
    id: asText(row.id, 'id'),
    expiresAt: asDate(row.expiresAt, 'session.expiresAt'),
    token: asText(row.token, 'token'),
    createdAt: asDate(row.createdAt, 'session.createdAt'),
    updatedAt: asDate(row.updatedAt, 'session.updatedAt'),
    ipAddress: asOptionalText(row.ipAddress, 'ipAddress'),
    userAgent: asOptionalText(row.userAgent, 'userAgent'),
    userId: asText(row.userId, 'userId'),
  })),
  move('verification', verification, (row) => ({
    id: asText(row.id, 'id'),
    identifier: asText(row.identifier, 'identifier'),
    value: asText(row.value, 'value'),
    expiresAt: asDate(row.expiresAt, 'verification.expiresAt'),
    createdAt: asDate(row.createdAt, 'verification.createdAt'),
    updatedAt: asDate(row.updatedAt, 'verification.updatedAt'),
  })),
  move('rateLimit', rateLimit, (row) => ({
    id: asText(row.id, 'id'),
    key: asText(row.key, 'key'),
    count: asNumber(row.count, 'rateLimit.count'),
    lastRequest: asNumber(row.lastRequest, 'rateLimit.lastRequest'),
  })),
  move('battles', battles, (row) => ({
    id: asText(row.id, 'id'),
    token: asText(row.token, 'token'),
    createdAt: asNumber(row.created_at, 'battles.created_at'),
  })),
  move('battle_users', battleUsers, (row) => ({
    battleId: asText(row.battle_id, 'battle_id'),
    userId: asText(row.user_id, 'user_id'),
    side: asNumber(row.side, 'battle_users.side'),
    joinedAt: asNumber(row.joined_at, 'battle_users.joined_at'),
  })),
  move('friendships', friendships, (row) => ({
    requesterId: asText(row.requester_id, 'requester_id'),
    addresseeId: asText(row.addressee_id, 'addressee_id'),
    requestedAt: asNumber(row.requested_at, 'friendships.requested_at'),
    acceptedAt: asOptionalNumber(row.accepted_at, 'friendships.accepted_at'),
  })),
  move('commands', commands, (row) => ({
    battleId: asText(row.battle_id, 'battle_id'),
    seq: asNumber(row.seq, 'commands.seq'),
    userId: asText(row.user_id, 'user_id'),
    at: asNumber(row.at, 'commands.at'),
    // Stored and moved as the text it is. Parsing it here would be a second
    // reader of the command format, and a chance to disagree with the first.
    body: asText(row.body, 'body'),
  })),
  move('rosters', rosters, (row) => ({
    id: asText(row.id, 'id'),
    userId: asText(row.user_id, 'user_id'),
    name: asText(row.name, 'name'),
    catalogueId: asText(row.catalogue_id, 'catalogue_id'),
    detachmentId: asOptionalText(row.detachment_id, 'detachment_id'),
    disposition: asOptionalText(row.disposition, 'disposition'),
    limit: asNumber(row.limit, 'rosters.limit'),
    picks: asText(row.picks, 'picks'),
    prep: asOptionalText(row.prep, 'prep'),
    tags: asText(row.tags, 'tags'),
    visibility: asText(row.visibility, 'visibility') as 'private' | 'unlisted',
    source: asText(row.source, 'source') as 'legacy' | 'editable' | 'battlebase' | 'newrecruit' | 'roster-file',
    updatedAt: asNumber(row.updated_at, 'rosters.updated_at'),
  })),
  move('collection', collection, (row) => ({
    userId: asText(row.user_id, 'user_id'),
    entryId: asText(row.entry_id, 'entry_id'),
    at: asNumber(row.at, 'collection.at'),
  })),
  move('favourite_factions', favouriteFactions, (row) => ({
    userId: asText(row.user_id, 'user_id'),
    catalogueId: asText(row.catalogue_id, 'catalogue_id'),
    at: asNumber(row.at, 'favourite_factions.at'),
  })),
]

export type ImportCount = { table: string; read: number; written: number }

/** Whether a table is in the source at all, so an older database is not a crash. */
function present(source: DatabaseSync, table: string) {
  const found = source.prepare(`select name from sqlite_master where type = 'table' and name = ?`).get(table)
  return Boolean(found)
}

/**
 * Copies every table, and says how much of each it moved.
 *
 * Re-running is safe: a row already in Postgres is left alone rather than
 * duplicated, so a migration interrupted halfway can simply be run again.
 */
export async function importSqlite(source: DatabaseSync, database: PraetoriumDatabase): Promise<ImportCount[]> {
  const counts: ImportCount[] = []
  await database.transaction(async (tx) => {
    for (const { from, table, copy } of MOVES) {
      if (!present(source, from)) {
        counts.push({ table, read: 0, written: 0 })
        continue
      }
      const rows = source.prepare(`select * from "${from}"`).all() as Row[]
      counts.push({ table, read: rows.length, written: await copy(rows, tx) })
    }
  })
  return counts
}

/** What the source holds, for comparison against what arrived. */
export function sqliteCounts(source: DatabaseSync) {
  return MOVES.map(({ from, table }) => {
    if (!present(source, from)) return { table, rows: 0 }
    const counted = source.prepare(`select count(*) as rows from "${from}"`).get() as { rows: number } | undefined
    return { table, rows: counted?.rows ?? 0 }
  })
}

/** The database to read. Pass `undefined` to mean "whatever is in DATA_DIR". */
export function sqlitePath(argument = process.argv[2]) {
  return argument ?? path.join(path.resolve(process.env.DATA_DIR ?? '/data'), 'praetorium.sqlite')
}

if (import.meta.url === `file://${process.argv[1]}`) {
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
}
