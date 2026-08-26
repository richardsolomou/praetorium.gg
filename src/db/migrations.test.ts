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

async function executeMigrationsBefore(client: PGlite, target: string) {
  const migrations = (await readdir(migrationsFolder)).filter((file) => /^\d{4}_.*\.sql$/.test(file) && file < target).sort()
  for (const migration of migrations) await executeMigration(client, migration)
}

it('moves an existing league and its sealed roster into event one', async () => {
  const client = new PGlite()
  try {
    const target = '0010_tiresome_randall_flagg.sql'
    await executeMigrationsBefore(client, target)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      VALUES ('owner', 'Owner', 'owner@example.test', false, now(), now());
      INSERT INTO "leagues" ("id", "token", "owner_id", "name", "description", "visibility", "admission", "player_limit", "created_at", "revealed_at")
      VALUES ('league', 'league-token', 'owner', 'League', '', 'private', 'automatic', 2, 10, 20);
      INSERT INTO "league_entries" ("league_id", "user_id", "status", "joined_at", "roster_id", "roster_name", "roster_snapshot", "submitted_at")
      VALUES ('league', 'owner', 'accepted', 11, 'roster', 'Army', 'sealed', 12);
    `)

    await executeMigration(client, target)

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

it('backfills Better Auth account issuers', async () => {
  const client = new PGlite()
  try {
    const target = '0011_little_guardian.sql'
    await executeMigrationsBefore(client, target)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES
        ('credential-user', 'Credential', 'credential@example.test', false, now(), now()),
        ('google-user', 'Google', 'google@example.test', false, now(), now()),
        ('discord-user', 'Discord', 'discord@example.test', false, now(), now());
      INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES
        ('credential', 'old-credential-id', 'credential', 'credential-user', now(), now()),
        ('google', 'google-subject', 'google', 'google-user', now(), now()),
        ('discord', 'discord-subject', 'discord', 'discord-user', now(), now());
    `)

    await executeMigration(client, target)

    const result = await client.query<{ id: string; accountId: string; issuer: string }>(`
      SELECT "id", "accountId", "issuer" FROM "account" ORDER BY "id"
    `)

    expect(result.rows).toEqual([
      { id: 'credential', accountId: 'credential-user', issuer: 'local:credential' },
      { id: 'discord', accountId: 'discord-subject', issuer: 'local:oauth:discord' },
      { id: 'google', accountId: 'google-subject', issuer: 'https://accounts.google.com' },
    ])
  } finally {
    await client.close()
  }
})

it('rejects unsupported account providers during the issuer backfill', async () => {
  const client = new PGlite()
  try {
    const target = '0011_little_guardian.sql'
    await executeMigrationsBefore(client, target)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      VALUES ('user', 'User', 'user@example.test', false, now(), now());
      INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
      VALUES ('account', 'subject', 'custom', 'user', now(), now());
    `)

    await expect(executeMigration(client, target)).rejects.toThrow('account issuer backfill found an unsupported provider')
  } finally {
    await client.close()
  }
})

it('rejects duplicate account identities during the issuer backfill', async () => {
  const client = new PGlite()
  try {
    const target = '0011_little_guardian.sql'
    await executeMigrationsBefore(client, target)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES
        ('first', 'First', 'first@example.test', false, now(), now()),
        ('second', 'Second', 'second@example.test', false, now(), now());
      INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES
        ('first-account', 'shared-subject', 'google', 'first', now(), now()),
        ('second-account', 'shared-subject', 'google', 'second', now(), now());
    `)

    await expect(executeMigration(client, target)).rejects.toThrow('account issuer backfill found duplicate identities')
  } finally {
    await client.close()
  }
})

it('keeps account inserts compatible during a rolling deployment', async () => {
  const client = new PGlite()
  try {
    const target = '0011_little_guardian.sql'
    await executeMigrationsBefore(client, target)
    await executeMigration(client, target)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      VALUES ('user', 'User', 'user@example.test', false, now(), now());
      INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
      VALUES ('account', 'subject', 'discord', 'user', now(), now());
    `)

    const result = await client.query<{ issuer: string }>('SELECT "issuer" FROM "account" WHERE "id" = \'account\'')

    expect(result.rows[0]?.issuer).toBe('local:oauth:discord')
  } finally {
    await client.close()
  }
})

it('backfills league event battles from their roster lock command', async () => {
  const client = new PGlite()
  try {
    const target = '0014_colossal_puma.sql'
    await executeMigrationsBefore(client, target)
    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
      VALUES ('owner', 'Owner', 'owner@example.test', false, now(), now());
      INSERT INTO "leagues" ("id", "token", "owner_id", "name", "description", "visibility", "admission", "created_at")
      VALUES ('league', 'league-token', 'owner', 'League', '', 'private', 'automatic', 1);
      INSERT INTO "league_events" ("id", "token", "league_id", "number", "created_at", "revealed_at")
      VALUES ('event', 'event-token', 'league', 1, 1, 2);
      INSERT INTO "battles" ("id", "token", "created_at") VALUES ('battle', 'battle-token', 3);
      INSERT INTO "commands" ("battle_id", "seq", "user_id", "at", "body")
      VALUES ('battle', 1, 'owner', 3, '{"kind":"lock-league-rosters","leagueToken":"league-token","eventToken":"event-token"}');
    `)

    await executeMigration(client, target)

    const result = await client.query<{ battleId: string; eventId: string }>(
      'SELECT "battle_id" AS "battleId", "event_id" AS "eventId" FROM "league_event_battles"',
    )
    expect(result.rows).toEqual([{ battleId: 'battle', eventId: 'event' }])
  } finally {
    await client.close()
  }
})
