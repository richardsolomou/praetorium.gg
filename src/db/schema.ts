import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/**
 * Someone playing, identified by a signed cookie rather than an account. A guest
 * identity is durable — it is the thing a battle's history points at — so an
 * account can be attached to one later without touching the log.
 */
export const players = sqliteTable('players', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
})

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

export const schema = { players, battles, battlePlayers, commands }
