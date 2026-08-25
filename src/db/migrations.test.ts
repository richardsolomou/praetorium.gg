import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { expect, it } from 'vitest'
import { migrationsFolder } from './connection'

async function executeMigration(client: PGlite, file: string) {
  const contents = await readFile(join(migrationsFolder, file), 'utf8')
  for (const statement of contents.split('--> statement-breakpoint').map((part) => part.trim())) {
    if (statement) await client.exec(statement)
  }
}

it('moves an existing league and its sealed roster into event one', async () => {
  const client = new PGlite()
  try {
    const migrations = (await readdir(migrationsFolder)).filter((file) => /^000[0-8]_.*\.sql$/.test(file)).sort()
    for (const migration of migrations) await executeMigration(client, migration)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      VALUES ('owner', 'Owner', 'owner@example.test', false, now(), now());
      INSERT INTO "leagues" ("id", "token", "owner_id", "name", "description", "visibility", "admission", "player_limit", "created_at", "revealed_at")
      VALUES ('league', 'league-token', 'owner', 'League', '', 'private', 'automatic', 2, 10, 20);
      INSERT INTO "league_entries" ("league_id", "user_id", "status", "joined_at", "roster_id", "roster_name", "roster_snapshot", "submitted_at")
      VALUES ('league', 'owner', 'accepted', 11, 'roster', 'Army', 'sealed', 12);
    `)

    await executeMigration(client, '0009_luxuriant_zodiak.sql')

    const result = await client.query<{
      recurring: boolean
      eventId: string
      eventToken: string
      eventNumber: number
      revealedAt: number
      userId: string
      rosterName: string
      rosterSnapshot: string
    }>(`
      SELECT l."recurring", e."id" AS "eventId", e."token" AS "eventToken", e."number" AS "eventNumber",
        e."revealed_at" AS "revealedAt", x."user_id" AS "userId", x."roster_name" AS "rosterName",
        x."roster_snapshot" AS "rosterSnapshot"
      FROM "leagues" l
      JOIN "league_events" e ON e."league_id" = l."id"
      JOIN "league_event_entries" x ON x."event_id" = e."id"
      WHERE l."id" = 'league'
    `)

    expect(result.rows).toEqual([
      {
        recurring: false,
        eventId: 'league',
        eventToken: 'league-token',
        eventNumber: 1,
        revealedAt: 20,
        userId: 'owner',
        rosterName: 'Army',
        rosterSnapshot: 'sealed',
      },
    ])
  } finally {
    await client.close()
  }
})
