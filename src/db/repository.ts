import { and, asc, desc, eq, isNull, ne, or } from 'drizzle-orm'
import {
  type Command,
  type LoggedCommand,
  PLAYERS_PER_BATTLE,
  reduceBattle,
  TEAM_BATTLE_PLAYERS,
  type SubmitResult,
  validate,
} from '../core/battle'
import { commandSchema } from '../core/commands'
import type { RosterSource } from '../core/savedRoster'
import type { PraetoriumDatabase } from './connection'
import { battleUsers, battles, collection, commands, favouriteFactions, friendships, rosters, user } from './schema'

type BattleRecord = { id: string; token: string; createdAt: number }
type BattlePlayer = { id: string; name: string; image: string | null; side: number }
export type BattleSeats = { battle: BattleRecord; players: BattlePlayer[] }

export type JoinResult = 'joined' | 'already-in' | 'full'

export class Repository {
  constructor(private readonly database: PraetoriumDatabase) {}

  createBattle(input: { id: string; token: string; userId: string; opponentIds?: string[]; initialCommand?: Command; now: number }) {
    this.database.transaction((tx) => {
      tx.insert(battles).values({ id: input.id, token: input.token, createdAt: input.now }).run()
      tx.insert(battleUsers).values({ battleId: input.id, userId: input.userId, side: 0, joinedAt: input.now }).run()
      input.opponentIds?.forEach((opponentId, index) =>
        tx
          .insert(battleUsers)
          .values({ battleId: input.id, userId: opponentId, side: 1, joinedAt: input.now + index })
          .run(),
      )
      if (input.initialCommand) {
        const ids = [input.userId, ...(input.opponentIds ?? [])]
        const state = reduceBattle(
          ids,
          [],
          ids.map((_, index) => (index ? 1 : 0)),
        )
        const refusal = validate(state, input.userId, input.initialCommand)
        if (refusal) throw new Error(`new battle settings were refused: ${refusal}`)
        tx.insert(commands)
          .values({
            battleId: input.id,
            seq: 1,
            userId: input.userId,
            at: input.now,
            body: JSON.stringify(input.initialCommand),
          })
          .run()
      }
    })
  }

  deleteBattle(battleId: string, userId: string) {
    return this.database.transaction((tx) => {
      const opener = this.playersByBattle(battleId, tx).find((player) => player.side === 0)
      if (opener?.id !== userId) return false
      tx.delete(battles).where(eq(battles.id, battleId)).run()
      return true
    })
  }

  userById(id: string) {
    return this.database.select().from(user).where(eq(user.id, id)).get()
  }

  profileByUserId(id: string) {
    return this.database.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, id)).get()
  }

  usersExcept(userId: string) {
    return this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(ne(user.id, userId))
      .orderBy(asc(user.name))
      .limit(100)
      .all()
  }

  friendships(userId: string) {
    return this.database
      .select()
      .from(friendships)
      .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
      .all()
  }

  requestFriend(requesterId: string, addresseeId: string, now: number) {
    return this.database.transaction((tx) => {
      const existing = tx
        .select()
        .from(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
            and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)),
          ),
        )
        .get()
      if (existing) return false
      tx.insert(friendships).values({ requesterId, addresseeId, requestedAt: now }).run()
      return true
    })
  }

  acceptFriend(requesterId: string, addresseeId: string, now: number) {
    return (
      this.database
        .update(friendships)
        .set({ acceptedAt: now })
        .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId), isNull(friendships.acceptedAt)))
        .run().changes > 0
    )
  }

  removeFriend(leftId: string, rightId: string) {
    return (
      this.database
        .delete(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, leftId), eq(friendships.addresseeId, rightId)),
            and(eq(friendships.requesterId, rightId), eq(friendships.addresseeId, leftId)),
          ),
        )
        .run().changes > 0
    )
  }

  battleByToken(token: string): BattleSeats | undefined {
    const battle = this.database.select().from(battles).where(eq(battles.token, token)).get()
    return battle ? { battle, players: this.playersByBattle(battle.id) } : undefined
  }

  /** Battles this player has a seat in, newest first. */
  battlesByUser(userId: string): BattleSeats[] {
    return this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt })
      .from(battles)
      .innerJoin(battleUsers, eq(battleUsers.battleId, battles.id))
      .where(eq(battleUsers.userId, userId))
      .orderBy(desc(battles.createdAt))
      .all()
      .map((battle) => ({ battle, players: this.playersByBattle(battle.id) }))
  }

  /** Takes an opposing seat, if one is still free. */
  join(input: { battleId: string; userId: string; now: number }): JoinResult {
    return this.database.transaction((tx) => {
      const seated = this.playersByBattle(input.battleId, tx)
      if (seated.some((player) => player.id === input.userId)) return 'already-in'
      const log = this.logQuery(input.battleId, tx)
      const state = reduceBattle(
        seated.map((player) => player.id),
        log,
        seated.map((player) => player.side),
      )
      const capacity = state.settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE
      if (seated.length >= capacity) return 'full'
      tx.insert(battleUsers).values({ battleId: input.battleId, userId: input.userId, side: 1, joinedAt: input.now }).run()
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
  submit(
    input: { battleId: string; userId: string; expectedSeq: number; command: Command; now: number },
    validateState?: (state: ReturnType<typeof reduceBattle>) => string | null,
  ): SubmitResult {
    return this.database.transaction((tx) => {
      const seated = this.playersByBattle(input.battleId, tx)
      const state = reduceBattle(
        seated.map((player) => player.id),
        this.logQuery(input.battleId, tx),
        seated.map((player) => player.side),
      )
      if (input.expectedSeq !== state.seq) return { outcome: 'stale', seq: state.seq }
      const refusal = validate(state, input.userId, input.command)
      if (refusal) return { outcome: 'refused', reason: refusal }
      const externalRefusal = validateState?.(state)
      if (externalRefusal) return { outcome: 'refused', reason: externalRefusal }
      const seq = state.seq + 1
      tx.insert(commands)
        .values({ battleId: input.battleId, seq, userId: input.userId, at: input.now, body: JSON.stringify(input.command) })
        .run()
      return { outcome: 'appended', seq }
    })
  }

  saveRoster(input: {
    id: string
    userId: string
    name: string
    catalogueId: string
    detachmentId: string | null
    disposition: string | null
    limit: number
    picks: string
    prep: string | null
    tags: string
    visibility: 'private' | 'unlisted'
    source: RosterSource
    now: number
  }) {
    this.database
      .insert(rosters)
      .values({
        id: input.id,
        userId: input.userId,
        name: input.name,
        catalogueId: input.catalogueId,
        detachmentId: input.detachmentId,
        disposition: input.disposition,
        limit: input.limit,
        picks: input.picks,
        prep: input.prep,
        tags: input.tags,
        visibility: input.visibility,
        source: input.source,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: rosters.id,
        set: {
          name: input.name,
          catalogueId: input.catalogueId,
          detachmentId: input.detachmentId,
          disposition: input.disposition,
          limit: input.limit,
          picks: input.picks,
          prep: input.prep,
          tags: input.tags,
          visibility: input.visibility,
          source: input.source,
          updatedAt: input.now,
        },
      })
      .run()
  }

  rostersByUser(userId: string) {
    return this.database.select().from(rosters).where(eq(rosters.userId, userId)).orderBy(desc(rosters.updatedAt)).all()
  }

  roster(id: string) {
    return this.database.select().from(rosters).where(eq(rosters.id, id)).get()
  }

  setRosterVisibility(id: string, userId: string, visibility: 'private' | 'unlisted', now: number) {
    return (
      this.database
        .update(rosters)
        .set({ visibility, updatedAt: now })
        .where(and(eq(rosters.id, id), eq(rosters.userId, userId)))
        .run().changes > 0
    )
  }

  /** The datasheets this player owns models for. */
  collectionByUser(userId: string) {
    return this.database.select().from(collection).where(eq(collection.userId, userId)).all()
  }

  /** Owning something twice is owning it once, so a repeat is not an error. */
  addToCollection(input: { userId: string; entryId: string; now: number }) {
    this.database.insert(collection).values({ userId: input.userId, entryId: input.entryId, at: input.now }).onConflictDoNothing().run()
  }

  removeFromCollection(userId: string, entryId: string) {
    this.database
      .delete(collection)
      .where(and(eq(collection.userId, userId), eq(collection.entryId, entryId)))
      .run()
  }

  favouriteFactionsByUser(userId: string) {
    return this.database.select().from(favouriteFactions).where(eq(favouriteFactions.userId, userId)).all()
  }

  addFavouriteFaction(input: { userId: string; catalogueId: string; now: number }) {
    this.database
      .insert(favouriteFactions)
      .values({ userId: input.userId, catalogueId: input.catalogueId, at: input.now })
      .onConflictDoNothing()
      .run()
  }

  removeFavouriteFaction(userId: string, catalogueId: string) {
    this.database
      .delete(favouriteFactions)
      .where(and(eq(favouriteFactions.userId, userId), eq(favouriteFactions.catalogueId, catalogueId)))
      .run()
  }

  deleteRoster(id: string, userId: string) {
    this.database
      .delete(rosters)
      .where(and(eq(rosters.id, id), eq(rosters.userId, userId)))
      .run()
  }

  private logQuery(battleId: string, tx: Transaction | PraetoriumDatabase = this.database): LoggedCommand[] {
    return tx
      .select({ seq: commands.seq, by: commands.userId, at: commands.at, body: commands.body })
      .from(commands)
      .where(eq(commands.battleId, battleId))
      .orderBy(asc(commands.seq))
      .all()
      .map((row) => ({ seq: row.seq, by: row.by, at: row.at, command: commandSchema.parse(JSON.parse(row.body)) }))
  }

  private playersByBattle(battleId: string, tx: Transaction | PraetoriumDatabase = this.database): BattlePlayer[] {
    return tx
      .select({ id: user.id, name: user.name, image: user.image, side: battleUsers.side })
      .from(battleUsers)
      .innerJoin(user, eq(user.id, battleUsers.userId))
      .where(eq(battleUsers.battleId, battleId))
      .orderBy(asc(battleUsers.side), asc(battleUsers.joinedAt))
      .all()
  }
}

type Transaction = Parameters<Parameters<PraetoriumDatabase['transaction']>[0]>[0]
