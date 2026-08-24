import { and, asc, count, desc, eq, exists, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm'
import { battleCapacity, type Command, type LoggedCommand, reduceBattle, type SubmitResult, validate } from '../core/battle'
import { commandSchema } from '../core/commands'
import type { RosterSource } from '../core/savedRoster'
import { alias } from 'drizzle-orm/pg-core'
import type { PraetoriumDatabase } from './connection'
import {
  battleUsers,
  battles,
  account,
  collection,
  commands,
  favouriteDetachments,
  favouriteFactions,
  friendships,
  practiceOpponents,
  rosters,
  user,
} from './schema'

type BattleRecord = { id: string; token: string; createdAt: number }
/** A seat and the account in it. `automated` is a practice opponent: an account that never signs in. */
type BattlePlayer = { id: string; name: string; image: string | null; side: number; automated: boolean }
export type BattleSeats = { battle: BattleRecord; players: BattlePlayer[] }
/** Seats and history together, so a list of battles costs no query per battle. */
export type BattleHistory = BattleSeats & { log: LoggedCommand[] }

export type JoinResult = 'joined' | 'already-in' | 'full'
export type UnlinkAccountResult = 'removed' | 'missing' | 'two-factor' | 'last-method'

export type AdminUser = {
  id: string
  name: string
  email: string
  image: string | null
  role: 'admin' | 'user'
  banned: boolean
  twoFactorEnabled: boolean
  createdAt: Date
  updatedAt: Date
  rosterCount: number
  battleCount: number
  signInMethods: string[]
}

/**
 * Whether the account in a seat is a practice opponent.
 *
 * Read from the join rather than a second query keyed on the ids the seats just
 * returned: it is the same answer, and every battle read goes through here.
 */
const AUTOMATED = sql<boolean>`${practiceOpponents.userId} is not null`

export class Repository {
  constructor(private readonly database: PraetoriumDatabase) {}

  /**
   * Opens a battle and seats everyone in it.
   *
   * The creator always takes the first seat on side 0, because deleting a battle is
   * the creator's alone and the earliest seat on that side is what says so — an ally
   * now sits beside them, so the side alone no longer does. Which side the pair of a 2v1
   * is on is the caller's to decide: `allyIds` join the creator, `opponentIds` face
   * them, so either player of an allied pair can be the one who opens the game.
   */
  async createBattle(input: {
    id: string
    token: string
    userId: string
    allyIds?: string[]
    opponentIds?: string[]
    initialCommand?: Command
    now: number
  }) {
    await this.database.transaction(async (tx) => {
      await tx.insert(battles).values({ id: input.id, token: input.token, createdAt: input.now })
      const seats = [
        { id: input.userId, side: 0 },
        ...(input.allyIds ?? []).map((id) => ({ id, side: 0 })),
        ...(input.opponentIds ?? []).map((id) => ({ id, side: 1 })),
      ]
      // Seats are read back by side then by when they were taken, so seating order
      // here is what decides which seat a side folds its shared resources onto.
      await tx
        .insert(battleUsers)
        .values(seats.map((seat, index) => ({ battleId: input.id, userId: seat.id, side: seat.side, joinedAt: input.now + index })))
      if (input.initialCommand) {
        const state = reduceBattle(
          seats.map((seat) => seat.id),
          [],
          seats.map((seat) => seat.side),
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

  /**
   * Deletes a battle, if the player asking is the one who opened it.
   *
   * The seat check is part of the delete rather than a read before it: as two
   * statements the seat could change between them, and it cost a transaction and
   * a round trip to say what one `exists` says here.
   *
   * The opener is the first seat taken on side 0. A seat on side 0 alone is no longer
   * enough — an ally now sits beside the opener — and the earliest seat alone is not
   * either: a battle opened before allies were seated wrote the opener and their
   * opponent the same `joinedAt`, so asking only for the earliest would hand that
   * opponent the delete.
   */
  async deleteBattle(battleId: string, userId: string) {
    const removed = await this.database
      .delete(battles)
      .where(
        and(
          eq(battles.id, battleId),
          exists(
            this.database
              .select({ one: sql`1` })
              .from(battleUsers)
              .where(
                and(
                  eq(battleUsers.battleId, battleId),
                  eq(battleUsers.userId, userId),
                  eq(battleUsers.side, 0),
                  eq(
                    battleUsers.joinedAt,
                    sql`(select min(${battleUsers.joinedAt}) from ${battleUsers} where ${battleUsers.battleId} = ${battleId} and ${battleUsers.side} = 0)`,
                  ),
                ),
              ),
          ),
        ),
      )
      .returning({ id: battles.id })
    return removed.length > 0
  }

  async userById(id: string) {
    const [row] = await this.database.select().from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  async adminUsers(limit = 500): Promise<AdminUser[]> {
    const users = await this.database
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        banned: user.banned,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(
        notExists(
          this.database.select({ id: practiceOpponents.userId }).from(practiceOpponents).where(eq(practiceOpponents.userId, user.id)),
        ),
      )
      .orderBy(desc(user.createdAt), asc(user.name))
      .limit(limit)
    if (!users.length) return []
    const ids = users.map(({ id }) => id)
    const [rosterCounts, battleCounts, methods] = await Promise.all([
      this.database
        .select({ userId: rosters.userId, count: count() })
        .from(rosters)
        .where(inArray(rosters.userId, ids))
        .groupBy(rosters.userId),
      this.database
        .select({ userId: battleUsers.userId, count: count() })
        .from(battleUsers)
        .where(inArray(battleUsers.userId, ids))
        .groupBy(battleUsers.userId),
      this.database.select({ userId: account.userId, providerId: account.providerId }).from(account).where(inArray(account.userId, ids)),
    ])
    const rosterCountByUser = new Map(rosterCounts.map((row) => [row.userId, row.count]))
    const battleCountByUser = new Map(battleCounts.map((row) => [row.userId, row.count]))
    const methodsByUser = new Map<string, Set<string>>()
    for (const method of methods) {
      const providers = methodsByUser.get(method.userId) ?? new Set<string>()
      providers.add(method.providerId)
      methodsByUser.set(method.userId, providers)
    }
    return users.map((entry) => ({
      ...entry,
      rosterCount: rosterCountByUser.get(entry.id) ?? 0,
      battleCount: battleCountByUser.get(entry.id) ?? 0,
      signInMethods: [...(methodsByUser.get(entry.id) ?? [])].sort((left, right) => left.localeCompare(right)),
    }))
  }

  async unlinkAccount(userId: string, providerId: string, availableProviders: readonly string[]): Promise<UnlinkAccountResult> {
    return this.database.transaction(async (tx) => {
      const [owner] = await tx.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)).for('update')
      const methods = await tx.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId))
      if (!methods.some((method) => method.providerId === providerId)) return 'missing'
      if (providerId === 'credential' && owner?.twoFactorEnabled) return 'two-factor'
      const available = new Set(availableProviders)
      if (!methods.some((method) => method.providerId !== providerId && available.has(method.providerId))) return 'last-method'
      await tx.delete(account).where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
      return 'removed'
    })
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

  /**
   * Players this one has no relationship with yet, so there is someone to ask.
   *
   * The exclusion is the database's: filtering a fetched page in memory returns
   * fewer than a page as soon as a player has connections, and a well-connected
   * one could be offered nobody at all while the instance is full of strangers.
   */
  async unrelatedUsers(userId: string, limit = 100) {
    const relationship = this.database
      .select({ one: sql`1` })
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, user.id)),
          and(eq(friendships.addresseeId, userId), eq(friendships.requesterId, user.id)),
        ),
      )
    const practice = this.database
      .select({ one: sql`1` })
      .from(practiceOpponents)
      .where(eq(practiceOpponents.userId, user.id))
    // A practice opponent is nobody to befriend: it is offered as a seat, not a player.
    return this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(ne(user.id, userId), notExists(relationship), notExists(practice)))
      .orderBy(asc(user.name))
      .limit(limit)
  }

  /** The practice opponents this instance seats, in the order they are offered. */
  async practiceOpponents() {
    return this.database
      .select({ id: user.id, name: user.name, image: user.image })
      .from(practiceOpponents)
      .innerJoin(user, eq(user.id, practiceOpponents.userId))
      .orderBy(asc(user.id))
  }

  /**
   * Every relationship this player is in, with the other party already named.
   *
   * The name comes from the join rather than a second lookup keyed on the ids
   * this query just returned, which is the same answer for one round trip.
   */
  async relationships(userId: string) {
    const other = alias(user, 'other')
    return this.database
      .select({
        requesterId: friendships.requesterId,
        addresseeId: friendships.addresseeId,
        acceptedAt: friendships.acceptedAt,
        otherId: other.id,
        otherName: other.name,
        otherImage: other.image,
      })
      .from(friendships)
      .innerJoin(other, or(eq(other.id, friendships.requesterId), eq(other.id, friendships.addresseeId)))
      .where(and(ne(other.id, userId), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
      .orderBy(asc(other.name))
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
   * would otherwise both read one free chair and both take it. How many chairs
   * there are is settled here and nowhere else — a practice battle has one, so a
   * second player is refused as full rather than by a separate rule that could
   * come to disagree with this one.
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
      if (seated.length >= battleCapacity(state.settings)) return 'full'
      await tx.insert(battleUsers).values({ battleId: input.battleId, userId: input.userId, side: 1, joinedAt: input.now })
      return 'joined'
    })
  }

  async log(battleId: string): Promise<LoggedCommand[]> {
    return this.logQuery(battleId)
  }

  /**
   * Appends one command, or explains why not, and answers with the history it judged.
   *
   * Reading history, judging the command against it, and writing the result all
   * happen in one transaction, and the battle row is locked before any of it. A
   * transaction alone would not be enough here: two players tapping at once would
   * both read the same `seq` and race for the same position in history. The
   * primary key would refuse the loser, but as an error rather than the answer it
   * is owed. Locking the battle makes them queue, so the second is told it is
   * behind. `expectedSeq` is the caller's claim about what it had already seen.
   *
   * The log comes back because the caller owes the client the state its command
   * landed in, and under the lock this transaction is the only thing that could
   * have changed it — so reading it again afterwards would be a second round trip
   * for the same answer, on the one path a battle takes on every single tap.
   */
  async submit(
    input: { battleId: string; userId: string; expectedSeq: number; command: Command; now: number },
    validateState?: (state: ReturnType<typeof reduceBattle>) => string | null,
    resolveCommand: (state: ReturnType<typeof reduceBattle>, command: Command) => Command = (_, command) => command,
  ): Promise<{ result: SubmitResult; log: LoggedCommand[] }> {
    return this.database.transaction(async (tx) => {
      await lockBattle(tx, input.battleId)
      const seated = await this.playersByBattle(input.battleId, tx)
      const log = await this.logQuery(input.battleId, tx)
      const state = reduceBattle(
        seated.map((player) => player.id),
        log,
        seated.map((player) => player.side),
      )
      if (input.expectedSeq !== state.seq) return { result: { outcome: 'stale', seq: state.seq }, log }
      const command = resolveCommand(state, input.command)
      const refusal = validate(state, input.userId, command)
      if (refusal) return { result: { outcome: 'refused', reason: refusal }, log }
      const externalRefusal = validateState?.(state)
      if (externalRefusal) return { result: { outcome: 'refused', reason: externalRefusal }, log }
      const seq = state.seq + 1
      await tx
        .insert(commands)
        .values({ battleId: input.battleId, seq, userId: input.userId, at: input.now, body: JSON.stringify(command) })
      return { result: { outcome: 'appended', seq }, log: [...log, { seq, by: input.userId, at: input.now, command }] }
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
    const updated = await this.database
      .update(rosters)
      .set(updatable)
      .where(and(eq(rosters.id, input.id), eq(rosters.userId, input.userId)))
      .returning({ id: rosters.id })
    if (updated.length) return true
    const inserted = await this.database
      .insert(rosters)
      .values({ id: input.id, userId: input.userId, createdAt: input.now, ...updatable })
      .onConflictDoNothing()
      .returning({ id: rosters.id })
    return inserted.length > 0
  }

  async rostersByUser(userId: string) {
    return this.database.select().from(rosters).where(eq(rosters.userId, userId)).orderBy(desc(rosters.createdAt))
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

  async favouriteDetachmentsByUser(userId: string) {
    return this.database.select().from(favouriteDetachments).where(eq(favouriteDetachments.userId, userId))
  }

  async addFavouriteDetachment(input: { userId: string; catalogueId: string; detachmentId: string; now: number }) {
    await this.database
      .insert(favouriteDetachments)
      .values({ userId: input.userId, catalogueId: input.catalogueId, detachmentId: input.detachmentId, at: input.now })
      .onConflictDoNothing()
  }

  async removeFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string) {
    await this.database
      .delete(favouriteDetachments)
      .where(
        and(
          eq(favouriteDetachments.userId, userId),
          eq(favouriteDetachments.catalogueId, catalogueId),
          eq(favouriteDetachments.detachmentId, detachmentId),
        ),
      )
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
      .select({ id: user.id, name: user.name, image: user.image, side: battleUsers.side, automated: AUTOMATED })
      .from(battleUsers)
      .innerJoin(user, eq(user.id, battleUsers.userId))
      .leftJoin(practiceOpponents, eq(practiceOpponents.userId, user.id))
      .where(eq(battleUsers.battleId, battleId))
      .orderBy(asc(battleUsers.side), asc(battleUsers.joinedAt))
  }

  /** Every seat for a set of battles, grouped and in the order each battle shows them. */
  private async playersByBattles(battleIds: readonly string[]) {
    const grouped = new Map<string, BattlePlayer[]>()
    if (!battleIds.length) return grouped
    const rows = await this.database
      .select({
        battleId: battleUsers.battleId,
        id: user.id,
        name: user.name,
        image: user.image,
        side: battleUsers.side,
        automated: AUTOMATED,
      })
      .from(battleUsers)
      .innerJoin(user, eq(user.id, battleUsers.userId))
      .leftJoin(practiceOpponents, eq(practiceOpponents.userId, user.id))
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
