import { and, asc, desc, eq, exists, inArray, isNull, ne, notExists, or, sql } from 'drizzle-orm'
import { battleCapacity, type Command, type LoggedCommand, reduceBattle, type SubmitResult, validate } from '../core/battle'
import { commandSchema } from '../core/commands'
import type { RosterSource } from '../core/savedRoster'
import type { EventParticipantRecord, EventRecord, EventRosterSnapshot } from '../core/event'
import { alias } from 'drizzle-orm/pg-core'
import type { PraetoriumDatabase } from './connection'
import {
  battleUsers,
  battles,
  collection,
  commands,
  eventParticipants,
  events,
  favouriteDetachments,
  favouriteFactions,
  friendships,
  rosters,
  user,
} from './schema'

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

  /**
   * Deletes a battle, if the player asking is the one who opened it.
   *
   * The seat check is part of the delete rather than a read before it: as two
   * statements the seat could change between them, and it cost a transaction and
   * a round trip to say what one `exists` says here.
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
              .where(and(eq(battleUsers.battleId, battleId), eq(battleUsers.userId, userId), eq(battleUsers.side, 0))),
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
    return this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(and(ne(user.id, userId), notExists(relationship)))
      .orderBy(asc(user.name))
      .limit(limit)
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

  async createEvent(input: {
    id: string
    name: string
    creatorId: string
    participants: { userId: string; limit: number }[]
    now: number
  }) {
    await this.database.transaction(async (tx) => {
      await tx.insert(events).values({ id: input.id, name: input.name, creatorId: input.creatorId, createdAt: input.now })
      await tx.insert(eventParticipants).values(input.participants.map((participant) => ({ eventId: input.id, ...participant })))
    })
  }

  async eventsByUser(userId: string) {
    return this.database
      .select({ id: events.id, name: events.name, creatorId: events.creatorId, createdAt: events.createdAt, revealedAt: events.revealedAt })
      .from(events)
      .innerJoin(eventParticipants, eq(eventParticipants.eventId, events.id))
      .where(eq(eventParticipants.userId, userId))
      .orderBy(desc(events.createdAt))
  }

  async event(id: string): Promise<{ event: EventRecord; participants: EventParticipantRecord[] } | null> {
    const [event] = await this.database.select().from(events).where(eq(events.id, id)).limit(1)
    if (!event) return null
    const rows = await this.database
      .select({
        userId: eventParticipants.userId,
        name: user.name,
        image: user.image,
        limit: eventParticipants.limit,
        rosterId: eventParticipants.rosterId,
        sealedAt: eventParticipants.sealedAt,
        snapshot: eventParticipants.snapshot,
      })
      .from(eventParticipants)
      .innerJoin(user, eq(user.id, eventParticipants.userId))
      .where(eq(eventParticipants.eventId, id))
      .orderBy(asc(user.name))
    return {
      event,
      participants: rows.map((row) => ({ ...row, snapshot: row.snapshot ? (JSON.parse(row.snapshot) as EventRosterSnapshot) : null })),
    }
  }

  async selectEventRoster(eventId: string, userId: string, rosterId: string) {
    return this.database.transaction(async (tx) => {
      const [event] = await tx.select({ revealedAt: events.revealedAt }).from(events).where(eq(events.id, eventId)).for('update')
      if (!event || event.revealedAt !== null) return false
      const [roster] = await tx
        .select({ id: rosters.id })
        .from(rosters)
        .where(and(eq(rosters.id, rosterId), eq(rosters.userId, userId)))
        .limit(1)
      if (!roster) return false
      const updated = await tx
        .update(eventParticipants)
        .set({ rosterId, snapshot: null, sealedAt: null })
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)))
        .returning({ eventId: eventParticipants.eventId })
      return updated.length > 0
    })
  }

  /** Freezes the roster and reveals the event in the same transaction as the final seal. */
  async sealEventRoster(eventId: string, userId: string, now: number) {
    return this.database.transaction(async (tx) => {
      const [event] = await tx.select().from(events).where(eq(events.id, eventId)).for('update')
      if (!event || event.revealedAt !== null) return null
      const [participant] = await tx
        .select({ limit: eventParticipants.limit, rosterId: eventParticipants.rosterId })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)))
        .limit(1)
      if (!participant?.rosterId) return null
      const [roster] = await tx
        .select()
        .from(rosters)
        .where(and(eq(rosters.id, participant.rosterId), eq(rosters.userId, userId)))
        .limit(1)
      if (!roster || roster.limit !== participant.limit) return null
      const snapshot: EventRosterSnapshot = {
        id: roster.id,
        name: roster.name,
        catalogueId: roster.catalogueId,
        detachmentId: roster.detachmentId,
        disposition: roster.disposition,
        limit: roster.limit,
        picks: roster.picks,
        prep: roster.prep,
        tags: roster.tags,
        source: roster.source,
        updatedAt: roster.updatedAt,
      }
      await tx
        .update(eventParticipants)
        .set({ snapshot: JSON.stringify(snapshot), sealedAt: now })
        .where(and(eq(eventParticipants.eventId, eventId), eq(eventParticipants.userId, userId)))
      const [waiting] = await tx
        .select({ userId: eventParticipants.userId })
        .from(eventParticipants)
        .where(and(eq(eventParticipants.eventId, eventId), isNull(eventParticipants.sealedAt)))
        .limit(1)
      const revealed = !waiting
      if (revealed) await tx.update(events).set({ revealedAt: now }).where(eq(events.id, eventId))
      return { revealed }
    })
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
