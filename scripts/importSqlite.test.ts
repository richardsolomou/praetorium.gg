import { DatabaseSync } from 'node:sqlite'
import { asc, eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import type { PraetoriumConnection } from '../src/db/connection'
import { openTestDatabase } from '../src/db/testDatabase'
import { battleUsers, battles, collection, commands, friendships, rosters, user } from '../src/db/schema'
import { importSqlite, sqliteCounts } from './importSqlite'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

/** The shape the SQLite build actually had, so the copy is tested against the real thing. */
function legacyDatabase() {
  const source = new DatabaseSync(':memory:')
  source.exec(`
    CREATE TABLE user (
      id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL,
      emailVerified integer NOT NULL, image text, createdAt text NOT NULL, updatedAt text NOT NULL
    );
    CREATE TABLE account (
      id text PRIMARY KEY NOT NULL, accountId text NOT NULL, providerId text NOT NULL, userId text NOT NULL,
      accessToken text, refreshToken text, idToken text, accessTokenExpiresAt text, refreshTokenExpiresAt text,
      scope text, password text, createdAt text NOT NULL, updatedAt text NOT NULL
    );
    CREATE TABLE session (
      id text PRIMARY KEY NOT NULL, expiresAt text NOT NULL, token text NOT NULL, createdAt text NOT NULL,
      updatedAt text NOT NULL, ipAddress text, userAgent text, userId text NOT NULL
    );
    CREATE TABLE battles (id text PRIMARY KEY NOT NULL, token text NOT NULL, created_at integer NOT NULL);
    CREATE TABLE battle_users (
      battle_id text NOT NULL, user_id text NOT NULL, side integer NOT NULL, joined_at integer NOT NULL
    );
    CREATE TABLE friendships (
      requester_id text NOT NULL, addressee_id text NOT NULL, requested_at integer NOT NULL, accepted_at integer
    );
    CREATE TABLE commands (
      battle_id text NOT NULL, seq integer NOT NULL, user_id text NOT NULL, at integer NOT NULL, body text NOT NULL
    );
    CREATE TABLE rosters (
      id text PRIMARY KEY NOT NULL, user_id text NOT NULL, name text NOT NULL, catalogue_id text NOT NULL,
      detachment_id text, disposition text, "limit" integer NOT NULL, picks text NOT NULL, prep text,
      tags text NOT NULL DEFAULT '[]', visibility text NOT NULL DEFAULT 'unlisted',
      source text NOT NULL DEFAULT 'legacy', updated_at integer NOT NULL
    );
    CREATE TABLE collection (user_id text NOT NULL, entry_id text NOT NULL, at integer NOT NULL);
    CREATE TABLE favourite_factions (user_id text NOT NULL, catalogue_id text NOT NULL, at integer NOT NULL);

    INSERT INTO user VALUES
      ('user-alice', 'Alice', 'alice@example.test', 1, 'https://example.test/a.png', '2025-03-04T05:06:07.008Z', '2025-03-04T05:06:07.008Z'),
      ('user-bob', 'Bob', 'bob@example.test', 0, NULL, '2025-03-05T00:00:00.000Z', '2025-03-05T00:00:00.000Z');
    INSERT INTO account VALUES
      ('acct-alice', 'alice@example.test', 'credential', 'user-alice', NULL, NULL, NULL, NULL, NULL, NULL,
       'hashed-password', '2025-03-04T05:06:07.008Z', '2025-03-04T05:06:07.008Z');
    INSERT INTO session VALUES
      ('sess-alice', '2025-06-01T00:00:00.000Z', 'session-token', '2025-03-04T05:06:07.008Z',
       '2025-03-04T05:06:07.008Z', '203.0.113.7', 'Firefox', 'user-alice');
    INSERT INTO battles VALUES ('battle-1', 'share-token', 1767000000123);
    INSERT INTO battle_users VALUES ('battle-1', 'user-alice', 0, 1767000000123), ('battle-1', 'user-bob', 1, 1767000000456);
    INSERT INTO friendships VALUES ('user-alice', 'user-bob', 1767000000000, 1767000000999);
    INSERT INTO commands VALUES
      ('battle-1', 1, 'user-alice', 1767000001000, '{"kind":"attach-roster","roster":{"name":"Ultramarines","text":"10 Intercessors"}}'),
      ('battle-1', 2, 'user-alice', 1767000002000, '{"kind":"begin-battle","firstPlayerId":"user-alice"}');
    INSERT INTO rosters VALUES
      ('roster-1', 'user-alice', 'Recon force', 'necrons', '["awakened-dynasty"]', 'reconnaissance', 2000,
       '[{"entryId":"abc"}]', NULL, '[]', 'private', 'editable', 1767000003000);
    INSERT INTO collection VALUES ('user-alice', 'datasheet-1', 1767000004000);
    INSERT INTO favourite_factions VALUES ('user-alice', 'necrons', 1767000005000);
  `)
  return source
}

describe('importing a SQLite Praetorium', () => {
  it('moves every table and keeps ids, timestamps and JSON intact', async () => {
    connection = await openTestDatabase()
    const source = legacyDatabase()

    const counts = await importSqlite(source, connection.database)

    // Every row in the source was read, and every row read was written.
    expect(counts).toEqual(sqliteCounts(source).map(({ table, rows }) => ({ table, read: rows, written: rows })))

    const [alice] = await connection.database.select().from(user).where(eq(user.id, 'user-alice'))
    expect(alice).toMatchObject({ name: 'Alice', email: 'alice@example.test', emailVerified: true, image: 'https://example.test/a.png' })
    // The ISO text SQLite held is the same instant in Postgres.
    expect(alice?.createdAt.toISOString()).toBe('2025-03-04T05:06:07.008Z')

    const [bob] = await connection.database.select().from(user).where(eq(user.id, 'user-bob'))
    expect(bob).toMatchObject({ emailVerified: false, image: null })

    // Epoch milliseconds are past what a 4-byte integer holds, so this is the
    // assertion that the bigint columns are actually bigint.
    const [battle] = await connection.database.select().from(battles)
    expect(battle).toEqual({ id: 'battle-1', token: 'share-token', createdAt: 1_767_000_000_123 })
    expect(typeof battle?.createdAt).toBe('number')

    const seats = await connection.database.select().from(battleUsers).orderBy(asc(battleUsers.side))
    expect(seats).toEqual([
      { battleId: 'battle-1', userId: 'user-alice', side: 0, joinedAt: 1_767_000_000_123 },
      { battleId: 'battle-1', userId: 'user-bob', side: 1, joinedAt: 1_767_000_000_456 },
    ])

    const log = await connection.database.select().from(commands).orderBy(asc(commands.seq))
    expect(log.map((entry) => JSON.parse(entry.body))).toEqual([
      { kind: 'attach-roster', roster: { name: 'Ultramarines', text: '10 Intercessors' } },
      { kind: 'begin-battle', firstPlayerId: 'user-alice' },
    ])

    const [friendship] = await connection.database.select().from(friendships)
    expect(friendship).toEqual({
      requesterId: 'user-alice',
      addresseeId: 'user-bob',
      requestedAt: 1_767_000_000_000,
      acceptedAt: 1_767_000_000_999,
    })

    const [roster] = await connection.database.select().from(rosters)
    expect(roster).toMatchObject({
      id: 'roster-1',
      userId: 'user-alice',
      detachmentId: '["awakened-dynasty"]',
      limit: 2000,
      picks: '[{"entryId":"abc"}]',
      prep: null,
      visibility: 'private',
      source: 'editable',
      updatedAt: 1_767_000_003_000,
    })

    const owned = await connection.database.select().from(collection)
    expect(owned).toEqual([{ userId: 'user-alice', entryId: 'datasheet-1', at: 1_767_000_004_000 }])

    source.close()
  })

  it('can be run twice without duplicating anything', async () => {
    connection = await openTestDatabase()
    const source = legacyDatabase()

    await importSqlite(source, connection.database)
    const again = await importSqlite(source, connection.database)

    // Second time through every row is already there, so nothing is written.
    expect(again.filter((count) => count.written > 0)).toEqual([])
    expect(await connection.database.select().from(user)).toHaveLength(2)
    expect(await connection.database.select().from(commands)).toHaveLength(2)
    source.close()
  })

  it('treats a table an older database never had as empty', async () => {
    connection = await openTestDatabase()
    const source = legacyDatabase()
    source.exec('DROP TABLE favourite_factions')

    const counts = await importSqlite(source, connection.database)

    expect(counts.find((count) => count.table === 'favourite_factions')).toEqual({
      table: 'favourite_factions',
      read: 0,
      written: 0,
    })
    source.close()
  })

  it('refuses a timestamp it cannot read rather than inventing one', async () => {
    connection = await openTestDatabase()
    const source = legacyDatabase()
    source.exec(`UPDATE user SET createdAt = 'not a date' WHERE id = 'user-alice'`)

    await expect(importSqlite(source, connection.database)).rejects.toThrow(/user.createdAt is not a date/)
    // The transaction rolled back, so nothing arrived at all.
    expect(await connection.database.select().from(user)).toHaveLength(0)
    source.close()
  })
})
