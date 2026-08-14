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
