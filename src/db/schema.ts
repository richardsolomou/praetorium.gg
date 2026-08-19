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

/** One game between opposing sides. Its token is the link they share. */
export const battles = sqliteTable(
  'battles',
  {
    id: text('id').primaryKey(),
    token: text('token').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [uniqueIndex('battles_token_unique').on(table.token)],
)

export const battleUsers = sqliteTable(
  'battle_users',
  {
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** 0 opened the battle, 1 accepted the link. Fixes the order players are shown in. */
    side: integer('side').notNull(),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.battleId, table.userId] }), index('battle_users_user_id_index').on(table.userId)],
)

/** A mutual connection, beginning as a request from one player to another. */
export const friendships = sqliteTable(
  'friendships',
  {
    requesterId: text('requester_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    addresseeId: text('addressee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    requestedAt: integer('requested_at').notNull(),
    acceptedAt: integer('accepted_at'),
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
 * unable to claim the same position in history, whatever else goes wrong.
 */
export const commands = sqliteTable(
  'commands',
  {
    battleId: text('battle_id')
      .notNull()
      .references(() => battles.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
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
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('rosters_user_id_index').on(table.userId)],
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
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** The catalogue entry id, so a datasheet is owned per book it appears in. */
    entryId: text('entry_id').notNull(),
    at: integer('at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.entryId] })],
)

/** Factions a player keeps at the top of faction pickers. */
export const favouriteFactions = sqliteTable(
  'favourite_factions',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    catalogueId: text('catalogue_id').notNull(),
    at: integer('at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.catalogueId] })],
)

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  battles,
  battleUsers,
  friendships,
  commands,
  rosters,
  collection,
  favouriteFactions,
}
