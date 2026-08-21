import { and, asc, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm'
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
import { alias } from 'drizzle-orm/pg-core'
import type { PraetoriumDatabase } from './connection'
import { battleUsers, battles, collection, commands, favouriteFactions, friendships, rosters, user } from './schema'

type BattleRecord = { id: string; token: string; createdAt: number }
type BattlePlayer = { id: string; name: string; image: string | null; side: number }
export type BattleSeats = { battle: BattleRecord; players: BattlePlayer[] }
/** Seats and history together, so a list of battles costs no query per battle. */
export type BattleHistory = BattleSeats & { log: LoggedCommand[] }

export type JoinResult = 'joined' | 'already-in' | 'full'

export class Repository {
  constructor(private readonly database: PraetoriumDatabase) {}

  async createBattle(input: { id: string; token: string; userId: string; opponentIds?: string[]; initialCommand?: Command; now: number }) {
    await this.database.transaction(async (tx) => {
      await tx.insert(battles).values({ id: input.id, token: input.token, createdAt: input.now })
      const ids = [input.userId, ...(input.opponentIds ?? [])]
      await tx
        .insert(battleUsers)
        .values(
          ids.map((id, index) => ({ battleId: input.id, userId: id, side: index ? 1 : 0, joinedAt: input.now + Math.max(index - 1, 0) })),
        )
      if (input.initialCommand) {
        const state = reduceBattle(
          ids,
          [],
          ids.map((_, index) => (index ? 1 : 0)),
        )
        const refusal = validate(state, input.userId, input.initialCommand)
        if (refusal) throw new Error(`new battle settings were refused: ${refusal}`)
        await tx.insert(commands).values({
          battleId: input.id,
          seq: 1,
          userId: input.userId,
          at: input.now,
          body: JSON.stringify(input.initialCommand),
        })
      }
    })
  }

  async deleteBattle(battleId: string, userId: string) {
    return this.database.transaction(async (tx) => {
      const opener = (await this.playersByBattle(battleId, tx)).find((player) => player.side === 0)
      if (opener?.id !== userId) return false
      await tx.delete(battles).where(eq(battles.id, battleId))
      return true
    })
  }

  async userById(id: string) {
    const [row] = await this.database.select().from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  async profileByUserId(id: string) {
    const [row] = await this.database.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  /** Names for many ids at once, so a friend list is one query rather than one per row. */
  async namesByIds(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string }>()
    const rows = await this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, [...new Set(ids)]))
    return new Map(rows.map((row) => [row.id, row]))
  }

  async usersExcept(userId: string) {
    return this.database.select({ id: user.id, name: user.name }).from(user).where(ne(user.id, userId)).orderBy(asc(user.name)).limit(100)
  }

  async friendships(userId: string) {
    return this.database
      .select()
      .from(friendships)
      .where(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))
  }

  /**
   * A request in either direction already answers this, so the pair is checked
   * before it is written. The primary key refuses a repeat of the same direction;
   * the mirrored pair is a different key, so it cannot be left to an upsert.
   */
  async requestFriend(requesterId: string, addresseeId: string, now: number) {
    return this.database.transaction(async (tx) => {
      const [existing] = await tx
        .select({ requesterId: friendships.requesterId })
        .from(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
            and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)),
          ),
        )
        .limit(1)
      if (existing) return false
      await tx.insert(friendships).values({ requesterId, addresseeId, requestedAt: now })
      return true
    })
  }

  async acceptFriend(requesterId: string, addresseeId: string, now: number) {
    const updated = await this.database
      .update(friendships)
      .set({ acceptedAt: now })
      .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId), isNull(friendships.acceptedAt)))
      .returning({ requesterId: friendships.requesterId })
    return updated.length > 0
  }

  async removeFriend(leftId: string, rightId: string) {
    const removed = await this.database
      .delete(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, leftId), eq(friendships.addresseeId, rightId)),
          and(eq(friendships.requesterId, rightId), eq(friendships.addresseeId, leftId)),
        ),
      )
      .returning({ requesterId: friendships.requesterId })
    return removed.length > 0
  }

  async battleByToken(token: string): Promise<BattleSeats | undefined> {
    const [battle] = await this.database.select().from(battles).where(eq(battles.token, token)).limit(1)
    return battle ? { battle, players: await this.playersByBattle(battle.id) } : undefined
  }

  /**
   * One battle behind its link, with its seats and its whole history.
   *
   * The seats and the log are asked for together, so opening a battle costs two
   * round trips rather than three.
   */
  async battleHistoryByToken(token: string): Promise<BattleHistory | undefined> {
    const [battle] = await this.database.select().from(battles).where(eq(battles.token, token)).limit(1)
    if (!battle) return undefined
    const [players, log] = await Promise.all([this.playersByBattle(battle.id), this.logQuery(battle.id)])
    return { battle, players, log }
  }

  /**
   * Battles this player has a seat in, newest first, with every log.
   *
   * Three queries whatever the count: the battles, then all their seats, then all
   * their commands. Reading a seat or a log per battle would put a round trip on
   * the page for every game a player has ever opened.
   */
  async battlesByUser(userId: string): Promise<BattleHistory[]> {
    const rows = await this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt })
      .from(battles)
      .innerJoin(battleUsers, eq(battleUsers.battleId, battles.id))
      .where(eq(battleUsers.userId, userId))
      .orderBy(desc(battles.createdAt))
    const ids = rows.map((row) => row.id)
    const [players, logs] = await Promise.all([this.playersByBattles(ids), this.logsByBattles(ids)])
    return rows.map((battle) => ({ battle, players: players.get(battle.id) ?? [], log: logs.get(battle.id) ?? [] }))
  }

  /**
   * Whether two players share any battle.
   *
   * One query that stops at the first match, rather than reading every battle a
   * player has ever opened to ask a yes-or-no question about one of them.
   */
  async shareBattle(userId: string, otherId: string) {
    const theirs = alias(battleUsers, 'theirs')
    const [row] = await this.database
      .select({ battleId: battleUsers.battleId })
      .from(battleUsers)
      .innerJoin(theirs, eq(theirs.battleId, battleUsers.battleId))
      .where(and(eq(battleUsers.userId, userId), eq(theirs.userId, otherId)))
      .limit(1)
    return Boolean(row)
  }

  /**
   * Takes an opposing seat, if one is still free.
   *
   * The battle row is locked first: two players following the same link at once
   * would otherwise both read one free chair and both take it.
   */
  async join(input: { battleId: string; userId: string; now: number }): Promise<JoinResult> {
    return this.database.transaction(async (tx) => {
      await lockBattle(tx, input.battleId)
      const seated = await this.playersByBattle(input.battleId, tx)
      if (seated.some((player) => player.id === input.userId)) return 'already-in'
      const log = await this.logQuery(input.battleId, tx)
      const state = reduceBattle(
        seated.map((player) => player.id),
        log,
        seated.map((player) => player.side),
      )
      const capacity = state.settings.teamBattle ? TEAM_BATTLE_PLAYERS : PLAYERS_PER_BATTLE
      if (seated.length >= capacity) return 'full'
      await tx.insert(battleUsers).values({ battleId: input.battleId, userId: input.userId, side: 1, joinedAt: input.now })
      return 'joined'
    })
  }

  async log(battleId: string): Promise<LoggedCommand[]> {
    return this.logQuery(battleId)
  }

  /**
   * Appends one command, or explains why not.
   *
   * Reading history, judging the command against it, and writing the result all
   * happen in one transaction, and the battle row is locked before any of it. A
   * transaction alone would not be enough here: two players tapping at once would
   * both read the same `seq` and race for the same position in history. The
   * primary key would refuse the loser, but as an error rather than the answer it
   * is owed. Locking the battle makes them queue, so the second is told it is
   * behind. `expectedSeq` is the caller's claim about what it had already seen.
   */
  async submit(
    input: { battleId: string; userId: string; expectedSeq: number; command: Command; now: number },
    validateState?: (state: ReturnType<typeof reduceBattle>) => string | null,
  ): Promise<SubmitResult> {
    return this.database.transaction(async (tx) => {
      await lockBattle(tx, input.battleId)
      const seated = await this.playersByBattle(input.battleId, tx)
      const state = reduceBattle(
        seated.map((player) => player.id),
        await this.logQuery(input.battleId, tx),
        seated.map((player) => player.side),
      )
      if (input.expectedSeq !== state.seq) return { outcome: 'stale', seq: state.seq }
      const refusal = validate(state, input.userId, input.command)
      if (refusal) return { outcome: 'refused', reason: refusal }
      const externalRefusal = validateState?.(state)
      if (externalRefusal) return { outcome: 'refused', reason: externalRefusal }
      const seq = state.seq + 1
      await tx
        .insert(commands)
        .values({ battleId: input.battleId, seq, userId: input.userId, at: input.now, body: JSON.stringify(input.command) })
      return { outcome: 'appended', seq }
    })
  }

  async saveRoster(input: {
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
    // Everything a later save may change. `id` identifies the row and `userId`
    // owns it, so neither is here: an upsert must not be able to reassign a list.
    const updatable = {
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
    }
    await this.database
      .insert(rosters)
      .values({ id: input.id, userId: input.userId, ...updatable })
      .onConflictDoUpdate({ target: rosters.id, set: updatable })
  }

  async rostersByUser(userId: string) {
    return this.database.select().from(rosters).where(eq(rosters.userId, userId)).orderBy(desc(rosters.updatedAt))
  }

  async roster(id: string) {
    const [row] = await this.database.select().from(rosters).where(eq(rosters.id, id)).limit(1)
    return row
  }

  async setRosterVisibility(id: string, userId: string, visibility: 'private' | 'unlisted', now: number) {
    const updated = await this.database
      .update(rosters)
      .set({ visibility, updatedAt: now })
      .where(and(eq(rosters.id, id), eq(rosters.userId, userId)))
      .returning({ id: rosters.id })
    return updated.length > 0
  }

  /** The datasheets this player owns models for. */
  async collectionByUser(userId: string) {
    return this.database.select().from(collection).where(eq(collection.userId, userId))
  }

  /** Owning something twice is owning it once, so a repeat is not an error. */
  async addToCollection(input: { userId: string; entryId: string; now: number }) {
    await this.database.insert(collection).values({ userId: input.userId, entryId: input.entryId, at: input.now }).onConflictDoNothing()
  }

  async removeFromCollection(userId: string, entryId: string) {
    await this.database.delete(collection).where(and(eq(collection.userId, userId), eq(collection.entryId, entryId)))
  }

  async favouriteFactionsByUser(userId: string) {
    return this.database.select().from(favouriteFactions).where(eq(favouriteFactions.userId, userId))
  }

  async addFavouriteFaction(input: { userId: string; catalogueId: string; now: number }) {
    await this.database
      .insert(favouriteFactions)
      .values({ userId: input.userId, catalogueId: input.catalogueId, at: input.now })
      .onConflictDoNothing()
  }

  async removeFavouriteFaction(userId: string, catalogueId: string) {
    await this.database
      .delete(favouriteFactions)
      .where(and(eq(favouriteFactions.userId, userId), eq(favouriteFactions.catalogueId, catalogueId)))
  }

  async deleteRoster(id: string, userId: string) {
    await this.database.delete(rosters).where(and(eq(rosters.id, id), eq(rosters.userId, userId)))
  }

  private async logQuery(battleId: string, tx: PraetoriumDatabase = this.database): Promise<LoggedCommand[]> {
    const rows = await tx
      .select({ seq: commands.seq, by: commands.userId, at: commands.at, body: commands.body })
      .from(commands)
      .where(eq(commands.battleId, battleId))
      .orderBy(asc(commands.seq))
    return rows.map(toLoggedCommand)
  }

  /** Every log for a set of battles, grouped. The primary key already orders it. */
  private async logsByBattles(battleIds: readonly string[]) {
    const grouped = new Map<string, LoggedCommand[]>()
    if (!battleIds.length) return grouped
    const rows = await this.database
      .select({ battleId: commands.battleId, seq: commands.seq, by: commands.userId, at: commands.at, body: commands.body })
      .from(commands)
      .where(inArray(commands.battleId, [...battleIds]))
      .orderBy(asc(commands.battleId), asc(commands.seq))
    for (const row of rows) {
      const log = grouped.get(row.battleId) ?? []
      log.push(toLoggedCommand(row))
      grouped.set(row.battleId, log)
    }
    return grouped
  }

  private async playersByBattle(battleId: string, tx: PraetoriumDatabase = this.database): Promise<BattlePlayer[]> {
    return tx
      .select({ id: user.id, name: user.name, image: user.image, side: battleUsers.side })
      .from(battleUsers)
      .innerJoin(user, eq(user.id, battleUsers.userId))
      .where(eq(battleUsers.battleId, battleId))
      .orderBy(asc(battleUsers.side), asc(battleUsers.joinedAt))
  }

  /** Every seat for a set of battles, grouped and in the order each battle shows them. */
  private async playersByBattles(battleIds: readonly string[]) {
    const grouped = new Map<string, BattlePlayer[]>()
    if (!battleIds.length) return grouped
    const rows = await this.database
      .select({ battleId: battleUsers.battleId, id: user.id, name: user.name, image: user.image, side: battleUsers.side })
      .from(battleUsers)
      .innerJoin(user, eq(user.id, battleUsers.userId))
      .where(inArray(battleUsers.battleId, [...battleIds]))
      .orderBy(asc(battleUsers.battleId), asc(battleUsers.side), asc(battleUsers.joinedAt))
    for (const { battleId, ...player } of rows) {
      const players = grouped.get(battleId) ?? []
      players.push(player)
      grouped.set(battleId, players)
    }
    return grouped
  }
}

/**
 * Serializes everything that appends to one battle.
 *
 * Per battle, so two games never wait on each other, and inside the caller's
 * transaction, so the lock is released with it either way.
 */
function lockBattle(tx: PraetoriumDatabase, battleId: string) {
  return tx.select({ id: battles.id }).from(battles).where(eq(battles.id, battleId)).for('update')
}

function toLoggedCommand(row: { seq: number; by: string; at: number; body: string }): LoggedCommand {
  return { seq: row.seq, by: row.by, at: row.at, command: commandSchema.parse(JSON.parse(row.body)) }
}
