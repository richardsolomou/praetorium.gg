import { and, asc, desc, eq } from 'drizzle-orm'
import { type Command, type LoggedCommand, PLAYERS_PER_BATTLE, reduceBattle, validate } from '../core/battle'
import { commandSchema } from '../core/commands'
import type { PraetoriumDatabase } from './connection'
import { battlePlayers, battles, collection, commands, players, rosters } from './schema'

export type BattleRecord = { id: string; token: string; createdAt: number }
export type BattlePlayer = { id: string; name: string; side: number }
export type BattleSeats = { battle: BattleRecord; players: BattlePlayer[] }

export type JoinResult = 'joined' | 'already-in' | 'full'

/**
 * `stale` carries the seq the caller should have had, so a client that lost a
 * race refetches rather than guessing. `refused` is the domain's own wording.
 */
export type SubmitResult = { outcome: 'appended'; seq: number } | { outcome: 'stale'; seq: number } | { outcome: 'refused'; reason: string }

export class Repository {
  constructor(private readonly database: PraetoriumDatabase) {}

  upsertPlayer(input: { id: string; name: string; userId: string; now: number }) {
    this.database
      .insert(players)
      .values({ id: input.id, name: input.name, userId: input.userId, createdAt: input.now })
      .onConflictDoUpdate({ target: players.id, set: { name: input.name } })
      .run()
  }

  player(id: string) {
    return this.database.select().from(players).where(eq(players.id, id)).get()
  }

  playerOfUser(userId: string) {
    return this.database.select().from(players).where(eq(players.userId, userId)).orderBy(desc(players.createdAt)).get()
  }

  createBattle(input: { id: string; token: string; playerId: string; now: number }) {
    this.database.transaction((tx) => {
      tx.insert(battles).values({ id: input.id, token: input.token, createdAt: input.now }).run()
      tx.insert(battlePlayers).values({ battleId: input.id, playerId: input.playerId, side: 0, joinedAt: input.now }).run()
    })
  }

  battleByToken(token: string): BattleSeats | undefined {
    const battle = this.database.select().from(battles).where(eq(battles.token, token)).get()
    return battle ? { battle, players: this.playersOf(battle.id) } : undefined
  }

  /** Battles this player has a seat in, newest first. */
  battlesOf(playerId: string): BattleSeats[] {
    return this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt })
      .from(battles)
      .innerJoin(battlePlayers, eq(battlePlayers.battleId, battles.id))
      .where(eq(battlePlayers.playerId, playerId))
      .orderBy(desc(battles.createdAt))
      .all()
      .map((battle) => ({ battle, players: this.playersOf(battle.id) }))
  }

  /** Takes the second seat, if it is still free. */
  join(input: { battleId: string; playerId: string; now: number }): JoinResult {
    return this.database.transaction((tx) => {
      const seated = this.playersOf(input.battleId, tx)
      if (seated.some((player) => player.id === input.playerId)) return 'already-in'
      if (seated.length >= PLAYERS_PER_BATTLE) return 'full'
      const side = Math.max(-1, ...seated.map((player) => player.side)) + 1
      tx.insert(battlePlayers).values({ battleId: input.battleId, playerId: input.playerId, side, joinedAt: input.now }).run()
      return 'joined'
    })
  }

  log(battleId: string): LoggedCommand[] {
    return this.logQuery(battleId)
  }

  /**
   * Appends one command, or explains why not.
   *
   * Reading history, judging the command against it, and writing the result all
   * happen in one transaction. Doing any of it outside would let a command that
   * was legal when it was checked land after another that made it illegal —
   * exactly the race two players tapping at once produces. `expectedSeq` is the
   * caller's claim about what it had already seen; a mismatch means it is behind,
   * and the answer is the current seq rather than a write.
   */
  submit(input: { battleId: string; playerId: string; expectedSeq: number; command: Command; now: number }): SubmitResult {
    return this.database.transaction((tx) => {
      const seated = this.playersOf(input.battleId, tx)
      const state = reduceBattle(
        seated.map((player) => player.id),
        this.logQuery(input.battleId, tx),
      )
      if (input.expectedSeq !== state.seq) return { outcome: 'stale', seq: state.seq }
      const refusal = validate(state, input.playerId, input.command)
      if (refusal) return { outcome: 'refused', reason: refusal }
      const seq = state.seq + 1
      tx.insert(commands)
        .values({ battleId: input.battleId, seq, playerId: input.playerId, at: input.now, body: JSON.stringify(input.command) })
        .run()
      return { outcome: 'appended', seq }
    })
  }

  saveRoster(input: {
    id: string
    playerId: string
    name: string
    catalogueId: string
    detachmentId: string | null
    limit: number
    picks: string
    prep: string | null
    now: number
  }) {
    this.database
      .insert(rosters)
      .values({ ...input, updatedAt: input.now })
      .onConflictDoUpdate({
        target: rosters.id,
        set: {
          name: input.name,
          catalogueId: input.catalogueId,
          detachmentId: input.detachmentId,
          limit: input.limit,
          picks: input.picks,
          prep: input.prep,
          updatedAt: input.now,
        },
      })
      .run()
  }

  rostersOf(playerId: string) {
    return this.database.select().from(rosters).where(eq(rosters.playerId, playerId)).orderBy(desc(rosters.updatedAt)).all()
  }

  roster(id: string) {
    return this.database.select().from(rosters).where(eq(rosters.id, id)).get()
  }

  /** The datasheets this player owns models for. */
  collectionOf(playerId: string) {
    return this.database.select().from(collection).where(eq(collection.playerId, playerId)).all()
  }

  /** Owning something twice is owning it once, so a repeat is not an error. */
  addToCollection(input: { playerId: string; entryId: string; now: number }) {
    this.database.insert(collection).values({ playerId: input.playerId, entryId: input.entryId, at: input.now }).onConflictDoNothing().run()
  }

  removeFromCollection(playerId: string, entryId: string) {
    this.database
      .delete(collection)
      .where(and(eq(collection.playerId, playerId), eq(collection.entryId, entryId)))
      .run()
  }

  deleteRoster(id: string, playerId: string) {
    this.database
      .delete(rosters)
      .where(and(eq(rosters.id, id), eq(rosters.playerId, playerId)))
      .run()
  }

  private logQuery(battleId: string, tx: Transaction | PraetoriumDatabase = this.database): LoggedCommand[] {
    return tx
      .select({ seq: commands.seq, by: commands.playerId, at: commands.at, body: commands.body })
      .from(commands)
      .where(eq(commands.battleId, battleId))
      .orderBy(asc(commands.seq))
      .all()
      .map((row) => ({ seq: row.seq, by: row.by, at: row.at, command: commandSchema.parse(JSON.parse(row.body)) }))
  }

  private playersOf(battleId: string, tx: Transaction | PraetoriumDatabase = this.database): BattlePlayer[] {
    return tx
      .select({ id: players.id, name: players.name, side: battlePlayers.side })
      .from(battlePlayers)
      .innerJoin(players, eq(players.id, battlePlayers.playerId))
      .where(eq(battlePlayers.battleId, battleId))
      .orderBy(asc(battlePlayers.side))
      .all()
  }
}

type Transaction = Parameters<Parameters<PraetoriumDatabase['transaction']>[0]>[0]
