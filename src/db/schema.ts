import { customType, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/** better-auth stores its dates as ISO strings. */
const isoDate = customType<{ data: Date; driverData: string }>({
  dataType: () => 'text',
  fromDriver: (value) => new Date(value),
  toDriver: (value) => value.toISOString(),
})

// The tables better-auth owns. Their shapes are dictated by better-auth, so
// product columns do not belong here.

export const user = sqliteTable('user', {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer({ mode: 'boolean' }).notNull(),
  image: text(),
  createdAt: isoDate().notNull(),
  updatedAt: isoDate().notNull(),
})

export const session = sqliteTable(
  'session',
  {
    id: text().primaryKey().notNull(),
    expiresAt: isoDate().notNull(),
    token: text().notNull().unique(),
    createdAt: isoDate().notNull(),
    updatedAt: isoDate().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = sqliteTable(
  'account',
  {
    id: text().primaryKey().notNull(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: isoDate(),
    refreshTokenExpiresAt: isoDate(),
    scope: text(),
    password: text(),
    createdAt: isoDate().notNull(),
    updatedAt: isoDate().notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId)],
)

export const verification = sqliteTable(
  'verification',
  {
    id: text().primaryKey().notNull(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: isoDate().notNull(),
    createdAt: isoDate().notNull(),
    updatedAt: isoDate().notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const rateLimit = sqliteTable(
  'rateLimit',
  {
    id: text().primaryKey().notNull(),
    key: text().notNull().unique(),
    count: integer().notNull(),
    lastRequest: integer().notNull(),
  },
  (table) => [index('rateLimit_key_idx').on(table.key)],
)

/** Someone playing. Kept separate from auth-owned users so logs retain stable player ids. */
export const players = sqliteTable(
  'players',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /**
     * The account this player is.
     *
     * One per account, mandatory: everything here — a battle, a saved list, a
     * command in a log — belongs to somebody who signed in. The row is still
     * separate from `user` because the command log points at `players.id` and
     * better-auth owns the shape of its own tables.
     */
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('players_user_id_index').on(table.userId)],
)

/** One game between two players. Its token is the link they share. */
export const battles = sqliteTable(
  'battles',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('battles_token_unique').on(table.token)],
)

export const battlePlayers = sqliteTable(
  'battle_players',
  {
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** 0 opened the battle, 1 accepted the link. Fixes the order players are shown in. */
    side: integer('side').notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.battleId, table.playerId] }), index('battle_players_player_id_index').on(table.playerId)],
)

/**
 * The battle's whole history, and the only record of its state — nothing derived
 * is stored, so there is no second copy of the score to disagree with this one.
 *
 * `seq` is per battle and gapless: the primary key is what makes two clients
 * unable to claim the same position in history, whatever else goes wrong.
 */
export const commands = sqliteTable(
  'commands',
  {
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    at: integer('at').notNull(),
    /** A `Command` as JSON, read back through `commandSchema`. */
    body: text('body').notNull(),
  },
  (table) => [primaryKey({ columns: [table.battleId, table.seq] })],
)

/**
 * A list a player keeps between battles.
 *
 * The picks are stored, not the expanded selections: re-pricing them against the
 * catalogue the instance currently holds is the honest answer when Games Workshop
 * changes points, and it is what a player expects a saved list to do.
 */
export const rosters = sqliteTable(
  'rosters',
  {
    id: text('id').primaryKey(),
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    catalogueId: text('catalogue_id').notNull(),
    detachmentId: text('detachment_id'),
    disposition: text('disposition'),
    limit: integer('limit').notNull(),
    /** The picked units as JSON: entry ids, model counts and chosen options. */
    picks: text('picks').notNull(),
    /** The player's own stratagems and secondaries as JSON, so they are typed once. */
    prep: text('prep'),
    /** Short player-authored labels as a JSON array. */
    tags: text('tags').notNull().default('[]'),
    /** Private rosters are owner-only; unlisted rosters resolve through their opaque id. */
    visibility: text('visibility', { enum: ['private', 'unlisted'] })
      .notNull()
      .default('unlisted'),
    /** How the list first entered Praetorium, retained through later edits. */
    source: text('source', { enum: ['legacy', 'editable', 'battlebase', 'roster-file'] })
      .notNull()
      .default('legacy'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('rosters_player_id_index').on(table.playerId)],
)

/**
 * The datasheets a player owns models for.
 *
 * Membership is the whole fact: a row means "I have these", and the picker can
 * offer to show nothing else. How many are owned is deliberately not stored —
 * the question the filter asks is whether a datasheet is in the collection at
 * all, and a count nobody reads would be a number to keep correct for nothing.
 */
export const collection = sqliteTable(
  'collection',
  {
    playerId: text('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** The catalogue entry id, so a datasheet is owned per book it appears in. */
    entryId: text('entry_id').notNull(),
    at: integer('at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.playerId, table.entryId] })],
)

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  players,
  battles,
  battlePlayers,
  commands,
  rosters,
  collection,
}
