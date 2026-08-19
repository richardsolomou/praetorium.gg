import fs from 'node:fs'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('roster metadata migration', () => {
  it('keeps legacy roster links available with explicit metadata defaults', () => {
    const database = new Database(':memory:')
    database.exec(`
      CREATE TABLE rosters (
        id text PRIMARY KEY NOT NULL,
        player_id text NOT NULL,
        name text NOT NULL,
        catalogue_id text NOT NULL,
        detachment_id text,
        disposition text,
        "limit" integer NOT NULL,
        picks text NOT NULL,
        prep text,
        updated_at integer NOT NULL
      );
      INSERT INTO rosters VALUES ('legacy', 'alice', 'Legacy army', 'cat', NULL, NULL, 2000, '[]', NULL, 1);
    `)
    const migration = fs
      .readFileSync(new URL('../../drizzle/0007_volatile_kinsey_walden.sql', import.meta.url), 'utf8')
      .replaceAll('--> statement-breakpoint', '')
    database.exec(migration)

    expect(database.prepare('SELECT tags, visibility, source FROM rosters WHERE id = ?').get('legacy')).toEqual({
      tags: '[]',
      visibility: 'unlisted',
      source: 'legacy',
    })
    database.close()
  })
})

describe('user ownership migration', () => {
  it('replaces player ids in ownership, seats, friendships, and command bodies', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    database.exec(`
      CREATE TABLE user (id text PRIMARY KEY NOT NULL);
      CREATE TABLE players (
        id text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        user_id text NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        created_at integer NOT NULL
      );
      CREATE TABLE battles (id text PRIMARY KEY NOT NULL, token text NOT NULL, created_at integer NOT NULL);
      CREATE TABLE battle_players (
        battle_id text NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        side integer NOT NULL,
        joined_at integer NOT NULL
      );
      CREATE TABLE commands (
        battle_id text NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
        seq integer NOT NULL,
        player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        at integer NOT NULL,
        body text NOT NULL
      );
      CREATE TABLE collection (player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE, entry_id text NOT NULL, at integer NOT NULL);
      CREATE TABLE favourite_factions (
        player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        catalogue_id text NOT NULL,
        at integer NOT NULL
      );
      CREATE TABLE friendships (
        requester_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        addressee_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        requested_at integer NOT NULL,
        accepted_at integer
      );
      CREATE TABLE rosters (
        id text PRIMARY KEY NOT NULL,
        player_id text NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        name text NOT NULL,
        catalogue_id text NOT NULL,
        detachment_id text,
        disposition text,
        "limit" integer NOT NULL,
        picks text NOT NULL,
        prep text,
        tags text DEFAULT '[]' NOT NULL,
        visibility text DEFAULT 'unlisted' NOT NULL,
        source text DEFAULT 'legacy' NOT NULL,
        updated_at integer NOT NULL
      );
      INSERT INTO user VALUES ('user-alice'), ('user-bob');
      INSERT INTO players VALUES ('player-alice', 'Alice', 'user-alice', 1), ('player-bob', 'Bob', 'user-bob', 2);
      INSERT INTO battles VALUES ('battle', 'token', 3);
      INSERT INTO battle_players VALUES ('battle', 'player-alice', 0, 3), ('battle', 'player-bob', 1, 4);
      INSERT INTO commands VALUES
        ('battle', 1, 'player-alice', 5, '{"kind":"begin-battle","firstPlayerId":"player-alice","attackerId":"player-bob"}'),
        ('battle', 2, 'player-alice', 6, '{"kind":"set-painted","painted":true,"playerId":"player-bob"}'),
        ('battle', 3, 'player-bob', 7, '{"kind":"end-battle","reason":"conceded","concededBy":"player-bob"}');
      INSERT INTO collection VALUES ('player-alice', 'datasheet', 8);
      INSERT INTO favourite_factions VALUES ('player-alice', 'faction', 9);
      INSERT INTO friendships VALUES ('player-alice', 'player-bob', 10, 11);
      INSERT INTO rosters VALUES ('roster', 'player-alice', 'Army', 'catalogue', NULL, NULL, 2000, '[]', NULL, '[]', 'private', 'editable', 12);
    `)
    const migration = fs
      .readFileSync(new URL('../../drizzle/0010_nosy_spirit.sql', import.meta.url), 'utf8')
      .replaceAll('--> statement-breakpoint', '')
    database.exec('BEGIN')
    database.exec(migration)
    database.exec('COMMIT')

    expect(database.prepare('SELECT battle_id, user_id, side FROM battle_users ORDER BY side').all()).toEqual([
      { battle_id: 'battle', user_id: 'user-alice', side: 0 },
      { battle_id: 'battle', user_id: 'user-bob', side: 1 },
    ])
    expect(database.prepare('SELECT user_id FROM collection').get()).toEqual({ user_id: 'user-alice' })
    expect(database.prepare('SELECT user_id FROM favourite_factions').get()).toEqual({ user_id: 'user-alice' })
    expect(database.prepare('SELECT user_id FROM rosters').get()).toEqual({ user_id: 'user-alice' })
    expect(database.prepare('SELECT requester_id, addressee_id FROM friendships').get()).toEqual({
      requester_id: 'user-alice',
      addressee_id: 'user-bob',
    })
    expect(
      database
        .prepare('SELECT user_id, body FROM commands ORDER BY seq')
        .all()
        .map((row) => ({ ...(row as { user_id: string; body: string }), body: JSON.parse((row as { body: string }).body) })),
    ).toEqual([
      {
        user_id: 'user-alice',
        body: { kind: 'begin-battle', firstPlayerId: 'user-alice', attackerId: 'user-bob' },
      },
      { user_id: 'user-alice', body: { kind: 'set-painted', painted: true, playerId: 'user-bob' } },
      { user_id: 'user-bob', body: { kind: 'end-battle', reason: 'conceded', concededBy: 'user-bob' } },
    ])
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'players'").get()).toBeUndefined()
    expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    database.close()
  })
})
