import { bigint, boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

/**
 * Every time in this schema is one of two kinds, and they are not interchangeable.
 *
 * better-auth owns its own columns and hands the driver `Date`, so those are
 * `timestamptz`. Everything the product owns is epoch milliseconds, which must be
 * `bigint`: a Postgres `integer` is four bytes and stops at about 2.1e9, while a
 * millisecond timestamp is already past 1.7e12. `integer` here would not be slow,
 * it would be wrong.
 */

// The tables better-auth owns below. Their shapes are dictated by better-auth,
// so product columns do not belong here.

/** `user` is a reserved word in Postgres. Drizzle quotes it, so the name still stands. */
export const user = pgTable(
  'user',
  {
    id: text().primaryKey().notNull(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    role: text({ enum: ['admin', 'user'] })
      .notNull()
      .default('user'),
    banned: boolean().notNull().default(false),
    banReason: text(),
    banExpires: timestamp({ withTimezone: true, mode: 'date' }),
    twoFactorEnabled: boolean().notNull().default(false),
  },
  (table) => [index('user_createdAt_id_idx').on(table.createdAt.desc(), table.id.desc())],
)

export const session = pgTable(
  'session',
  {
    id: text().primaryKey().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    token: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedBy: text(),
  },
  (table) => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text().primaryKey().notNull(),
    accountId: text().notNull(),
    issuer: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true, mode: 'date' }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true, mode: 'date' }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [index('account_userId_idx').on(table.userId), uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text().primaryKey().notNull(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const twoFactor = pgTable(
  'twoFactor',
  {
    id: text().primaryKey().notNull(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamp({ withTimezone: true, mode: 'date' }),
  },
  (table) => [index('twoFactor_secret_idx').on(table.secret), index('twoFactor_userId_idx').on(table.userId)],
)

/**
 * better-auth's own limiter table, kept for the case where Valkey is absent.
 * With Valkey configured the counters live there instead, one round trip
 * instead of a write per request.
 */
export const rateLimit = pgTable(
  'rateLimit',
  {
    id: text().primaryKey().notNull(),
    key: text().notNull().unique(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: 'number' }).notNull(),
  },
  // No index on `key`: the unique constraint above is already one, and a second
  // copy would cost a write per request to answer nothing new.
)

/** One game between opposing sides. Its token is the link they share. */
export const battles = pgTable(
  'battles',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [uniqueIndex('battles_token_unique').on(table.token)],
)

export const battleUsers = pgTable(
  'battle_users',
  {
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** 0 is the side the battle was opened from, 1 the side facing it. Fixes the order players are shown in. */
    side: integer('side').notNull(),
    joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.battleId, table.userId] }), index('battle_users_user_id_index').on(table.userId)],
)

/** A mutual connection, beginning as a request from one player to another. */
export const friendships = pgTable(
  'friendships',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestedAt: bigint('requested_at', { mode: 'number' }).notNull(),
    acceptedAt: bigint('accepted_at', { mode: 'number' }),
  },
  (table) => [
    primaryKey({ columns: [table.requesterId, table.addresseeId] }),
    index('friendships_addressee_id_index').on(table.addresseeId),
  ],
)

/**
 * The battle's whole history, and the only record of its state — nothing derived
 * is stored, so there is no second copy of the score to disagree with this one.
 *
 * `seq` is per battle and gapless: the primary key is what makes two clients
 * unable to claim the same position in history, whatever else goes wrong. It is
 * also what lets one query read the logs of many battles in `seq` order.
 */
export const commands = pgTable(
  'commands',
  {
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    at: bigint('at', { mode: 'number' }).notNull(),
    /** A `Command` as JSON, read back through `commandSchema`. */
    body: text('body').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.battleId, table.seq] }),
    // The user FK cascade otherwise scans the largest table on every account deletion.
    index('commands_user_id_index').on(table.userId),
  ],
)

/**
 * A list a player keeps between battles.
 *
 * The picks are stored, not the expanded selections: re-pricing them against the
 * catalogue the instance currently holds is the honest answer when Games Workshop
 * changes points, and it is what a player expects a saved list to do.
 */
export const rosters = pgTable(
  'rosters',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
    source: text('source', { enum: ['legacy', 'editable', 'battlebase', 'newrecruit', 'roster-file'] })
      .notNull()
      .default('legacy'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  // Lists are always read for one player newest-created first, which this index answers
  // outright. It also serves a plain lookup by player, so there is no separate
  // index on `user_id` to keep current.
  (table) => [index('rosters_user_id_created_at_index').on(table.userId, table.createdAt)],
)

export const leagues = pgTable(
  'leagues',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    visibility: text('visibility', { enum: ['public', 'private'] }).notNull(),
    admission: text('admission', { enum: ['automatic', 'approval'] }).notNull(),
    playerLimit: integer('player_limit'),
    recurring: boolean('recurring').notNull().default(false),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  },
  (table) => [
    uniqueIndex('leagues_token_unique').on(table.token),
    index('leagues_visibility_created_at_index').on(table.visibility, table.createdAt),
    index('leagues_owner_id_created_at_index').on(table.ownerId, table.createdAt),
  ],
)

export const leagueEvents = pgTable(
  'league_events',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    leagueId: text('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    format: text('format', { enum: ['1v1', '2v1'] }),
    rosterLimit: integer('roster_limit'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    revealedAt: bigint('revealed_at', { mode: 'number' }),
  },
  (table) => [
    uniqueIndex('league_events_token_unique').on(table.token),
    uniqueIndex('league_events_league_id_number_unique').on(table.leagueId, table.number),
    index('league_events_league_id_created_at_index').on(table.leagueId, table.createdAt),
  ],
)

export const leagueEventEntries = pgTable(
  'league_event_entries',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => leagueEvents.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] }).notNull(),
    joinedAt: bigint('joined_at', { mode: 'number' }).notNull(),
    rosterId: text('roster_id'),
    rosterName: text('roster_name'),
    rosterSnapshot: text('roster_snapshot'),
    submittedAt: bigint('submitted_at', { mode: 'number' }),
    requiredLimit: integer('required_limit'),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId] }), index('league_event_entries_user_id_index').on(table.userId)],
)

/**
 * The datasheets a player owns models for.
 *
 * Membership is the whole fact: a row means "I have these", and the picker can
 * offer to show nothing else. How many are owned is deliberately not stored —
 * the question the filter asks is whether a datasheet is in the collection at
 * all, and a count nobody reads would be a number to keep correct for nothing.
 */
export const collection = pgTable(
  'collection',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The catalogue entry id, so a datasheet is owned per book it appears in. */
    entryId: text('entry_id').notNull(),
    at: bigint('at', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.entryId] })],
)

/** Factions a player keeps at the top of faction pickers. */
export const favouriteFactions = pgTable(
  'favourite_factions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    catalogueId: text('catalogue_id').notNull(),
    at: bigint('at', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.catalogueId] })],
)

/**
 * Accounts that hold a seat and never sign in.
 *
 * A practice opponent is an account like any other — a battle, a seat and every
 * command still point at a `user` row, so nothing here invents a second kind of
 * identity. What it has is no credentials: there is no `account` row to
 * authenticate against, so the only way its side is ever played is by the people
 * sitting across from it.
 */
export const practiceOpponents = pgTable('practice_opponents', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
})

/** Detachments a player keeps at the top of roster setup. */
export const favouriteDetachments = pgTable(
  'favourite_detachments',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    catalogueId: text('catalogue_id').notNull(),
    detachmentId: text('detachment_id').notNull(),
    at: bigint('at', { mode: 'number' }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.catalogueId, table.detachmentId] })],
)

export const schema = {
  user,
  session,
  account,
  verification,
  twoFactor,
  rateLimit,
  battles,
  battleUsers,
  friendships,
  commands,
  rosters,
  leagues,
  leagueEvents,
  leagueEventEntries,
  collection,
  favouriteFactions,
  favouriteDetachments,
  practiceOpponents,
}
