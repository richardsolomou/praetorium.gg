import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import type { PraetoriumConnection } from '../src/db/connection'
import { openTestDatabase } from '../src/db/testDatabase'
import { battles, user } from '../src/db/schema'
import { importIfEmpty } from './importOnBoot'

let connection: PraetoriumConnection | undefined

afterEach(async () => {
  await connection?.close()
  connection = undefined
})

function legacyDatabase() {
  const source = new DatabaseSync(':memory:')
  source.exec(`
    CREATE TABLE user (
      id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL,
      emailVerified integer NOT NULL, image text, createdAt text NOT NULL, updatedAt text NOT NULL
    );
    CREATE TABLE battles (id text PRIMARY KEY NOT NULL, token text NOT NULL, created_at integer NOT NULL);
    INSERT INTO user VALUES ('u-a','Alice','a@example.test',1,NULL,'2025-03-04T05:06:07.008Z','2025-03-04T05:06:07.008Z');
    INSERT INTO battles VALUES ('b-1','tok-1',1767000000123);
  `)
  return source
}

it('imports on the boot that finds an empty Postgres', async () => {
  connection = await openTestDatabase()
  const source = legacyDatabase()

  const counts = await importIfEmpty(source, connection.database)

  expect(counts).not.toBeNull()
  expect(await connection.database.select().from(user)).toHaveLength(1)
  expect((await connection.database.select().from(battles))[0]?.createdAt).toBe(1_767_000_000_123)
  source.close()
})

it('does nothing once Postgres holds accounts, so a later boot cannot re-import', async () => {
  connection = await openTestDatabase()
  const source = legacyDatabase()
  await importIfEmpty(source, connection.database)
  // Something a player did after the cutover, which a second import must not disturb.
  await connection.database.insert(battles).values({ id: 'after', token: 'after-token', createdAt: 1_767_000_009_000 })

  const again = await importIfEmpty(source, connection.database)

  expect(again).toBeNull()
  // The imported battle and the one added afterwards, both still there.
  expect(await connection.database.select().from(battles)).toHaveLength(2)
  source.close()
})
