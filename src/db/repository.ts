import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  not,
  notExists,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'
import type { AdminUserPage, AdminUsersCursor } from '../admin'
import { type Command, type LoggedCommand, reduceBattle, type Roster, type SubmitResult, validate } from '../core/battle'
import { commandSchema, parseRosterSnapshot } from '../core/commands'
import { type BattleAudience, DEFAULT_BATTLE_AUDIENCE } from '../core/battleAudience'
import type { RosterSource } from '../core/savedRoster'
import {
  alliedLeagueRosterLimit,
  requiredLeagueRosterLimit,
  type LeagueAdmission,
  type LeagueEntryStatus,
  type LeagueVisibility,
} from '../core/league'
import type { TableShape } from '../core/tableShape'
import { alias } from 'drizzle-orm/pg-core'
import type { PraetoriumDatabase } from './connection'
import {
  battleSharing,
  battleUsers,
  battles,
  account,
  collection,
  commands,
  favouriteDetachments,
  favouriteFactions,
  friendships,
  leagueEventBattles,
  leagueEventEntries,
  leagueEvents,
  leagues,
  practiceOpponents,
  rosters,
  user,
} from './schema'

type BattleRecord = { id: string; token: string; createdAt: number }
/** One row of a list of battles: the battle, plus the time of its newest command. */
/** One row of a list of battles, with whatever value that list is ordered by. */
type BattleRow = BattleRecord & { at: number }
type DatabaseTransaction = Parameters<Parameters<PraetoriumDatabase['transaction']>[0]>[0]
type CreateBattleInput = {
  id: string
  token: string
  userId: string
  allyIds?: string[]
  opponentIds?: string[]
  initialCommand?: Command
  initialCommands?: Command[]
  now: number
}
/** A seat and the account in it. `automated` is a practice opponent: an account that never signs in. */
type BattlePlayer = { id: string; name: string; image: string | null; side: number; automated: boolean }
export type BattleSeats = { battle: BattleRecord; players: BattlePlayer[] }
/** Seats and history together, so a list of battles costs no query per battle. */
export type BattleHistory = BattleSeats & { log: LoggedCommand[] }
/** Where the previous page of battles ended: its last row's newest-command time and battle id. */
/** Where the previous page ended: its last row's ordering value and battle id. */
export type BattlesCursor = { at: number; id: string }

export type UnlinkAccountResult =
  | { status: 'removed'; account: { accessToken: string | null; refreshToken: string | null } }
  | { status: 'missing' | 'two-factor' | 'last-method' }
export type JoinLeagueResult = LeagueEntryStatus | 'missing' | 'closed' | 'full'
export type ModerateLeagueResult = 'updated' | 'missing' | 'forbidden' | 'closed' | 'full'
export type CreateLeagueEventResult = 'created' | 'missing' | 'forbidden' | 'open' | 'too-small'
export type MakeLeagueRecurringResult = 'updated' | 'missing' | 'forbidden'
export type UpdateLeagueResult = 'updated' | 'missing' | 'forbidden' | 'below-accepted' | 'team-minimum'
export type UpdateLeagueEventResult = 'updated' | 'missing' | 'forbidden' | 'closed' | 'sealed' | 'too-small'
export type DeleteLeagueResult = 'deleted' | 'missing' | 'forbidden'
export type AssignLeagueRosterRequirementResult = 'updated' | 'missing' | 'forbidden' | 'closed' | 'wrong-format' | 'wrong-limit'
export type AssignLeagueTeamResult = 'updated' | 'missing' | 'forbidden' | 'closed' | 'wrong-format'
export type SubmitLeagueRosterResult =
  | { outcome: 'sealed'; format: TableShape | null; requiredLimit: number | null }
  | { outcome: 'missing' | 'unassigned' | 'wrong-limit' }
  | { outcome: 'invalid-warlords'; format: TableShape | null }
export type RevealLeagueResult = { outcome: 'revealed' | 'not-ready' } | { outcome: 'invalid-warlords'; format: TableShape }
export type LeagueBattleCandidate = {
  token: string
  name: string
  eventToken: string
  eventNumber: number
  format: TableShape | null
  rosterLimit: number | null
  entries: { userId: string; requiredLimit: number | null; sealedLimit: number | null; teamId: string | null }[]
}

const ADMIN_USERS_PAGE_SIZE = 50
const LEAGUE_BATTLE_CANDIDATE_MAX = 50

function warlordSelection(snapshots: readonly Roster[], trustLegacySelection = false) {
  const selected = snapshots.flatMap((snapshot) => snapshot.built?.units.filter((unit) => unit.warlord) ?? [])
  return {
    count: selected.length,
    eligible: selected.every(
      (unit) => unit.warlordEligible ?? (trustLegacySelection || unit.group === 'character' || unit.group === 'epic-hero'),
    ),
  }
}

function frozenRosterLimit(snapshot: string | null) {
  if (snapshot === null) return null
  try {
    return parseRosterSnapshot(snapshot).built?.limit ?? null
  } catch {
    return null
  }
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
  async createBattle(input: CreateBattleInput) {
    await this.database.transaction((tx) => this.insertBattle(tx, input))
  }

  private async insertBattle(tx: DatabaseTransaction, input: CreateBattleInput) {
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
    const initialCommands = input.initialCommands ?? (input.initialCommand ? [input.initialCommand] : [])
    const log: LoggedCommand[] = []
    for (const [index, command] of initialCommands.entries()) {
      const state = reduceBattle(
        seats.map((seat) => seat.id),
        log,
        seats.map((seat) => seat.side),
      )
      const refusal = validate(state, input.userId, command)
      if (refusal) throw new Error(`new battle command was refused: ${refusal}`)
      log.push({ seq: index + 1, by: input.userId, at: input.now, command })
    }
    if (log.length) {
      await tx.insert(commands).values(
        log.map((entry) => ({
          battleId: input.id,
          seq: entry.seq,
          userId: entry.by,
          at: entry.at,
          body: JSON.stringify(entry.command),
        })),
      )
    }
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

  async adminUsers(input: { query?: string; cursor?: AdminUsersCursor | null; limit?: number } = {}): Promise<AdminUserPage> {
    const limit = Math.min(Math.max(input.limit ?? ADMIN_USERS_PAGE_SIZE, 1), 100)
    const query = input.query?.trim()
    const conditions = [
      notExists(
        this.database.select({ id: practiceOpponents.userId }).from(practiceOpponents).where(eq(practiceOpponents.userId, user.id)),
      ),
    ]
    if (query) {
      const escaped = query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
      conditions.push(or(ilike(user.name, `%${escaped}%`), ilike(user.email, `%${escaped}%`))!)
    }
    if (input.cursor) {
      conditions.push(
        or(lt(user.createdAt, input.cursor.createdAt), and(eq(user.createdAt, input.cursor.createdAt), lt(user.id, input.cursor.id)))!,
      )
    }
    const rows = await this.database
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
      .where(and(...conditions))
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit + 1)
    const users = rows.slice(0, limit)
    if (!users.length) return { users: [], nextCursor: null }
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
    const entries = users.map((entry) => ({
      ...entry,
      rosterCount: rosterCountByUser.get(entry.id) ?? 0,
      battleCount: battleCountByUser.get(entry.id) ?? 0,
      signInMethods: [...(methodsByUser.get(entry.id) ?? [])].sort((left, right) => left.localeCompare(right)),
    }))
    const last = users.at(-1)!
    return { users: entries, nextCursor: rows.length > limit ? { createdAt: last.createdAt, id: last.id } : null }
  }

  async unlinkAccount(userId: string, providerId: string, availableProviders: readonly string[]): Promise<UnlinkAccountResult> {
    return this.database.transaction(async (tx) => {
      const [owner] = await tx.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)).for('update')
      const methods = await tx.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId))
      if (!methods.some((method) => method.providerId === providerId)) return { status: 'missing' }
      if (providerId === 'credential' && owner?.twoFactorEnabled) return { status: 'two-factor' }
      const available = new Set(availableProviders)
      if (!methods.some((method) => method.providerId !== providerId && available.has(method.providerId))) return { status: 'last-method' }
      const [removed] = await tx
        .delete(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
        .returning({ accessToken: account.accessToken, refreshToken: account.refreshToken })
      return removed ? { status: 'removed', account: removed } : { status: 'missing' }
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
   * The time of a battle's newest command, which is what every list of battles is
   * ordered by. Creation stands in for a battle nothing has happened in yet.
   */
  private get activityTime() {
    return sql<number>`coalesce(max(${commands.at}), ${battles.createdAt})`.mapWith(Number)
  }

  /**
   * Where a page of battles resumes.
   *
   * The cursor is the previous page's last (activity, id) pair; ties on activity
   * fall back to the id so a page boundary cannot skip or repeat a battle. It
   * belongs to `having` rather than `where` because the activity it compares is
   * an aggregate over the battle's commands.
   */
  private resumeAfter(order: SQL<number>, cursor?: BattlesCursor) {
    if (!cursor) return undefined
    return or(sql`${order} < ${cursor.at}`, and(sql`${order} = ${cursor.at}`, lt(battles.id, cursor.id)))
  }

  /**
   * The same resumption for a list ordered by when a battle was started.
   *
   * Creation is a plain column rather than an aggregate over the commands, so it
   * narrows before the grouping instead of after it.
   */
  private startedBefore(cursor?: BattlesCursor) {
    if (!cursor) return undefined
    return or(lt(battles.createdAt, cursor.at), and(eq(battles.createdAt, cursor.at), lt(battles.id, cursor.id)))
  }

  /**
   * Attaches the seats and the logs to a page of battle rows.
   *
   * Every list of battles — a player's own, a league event's, a friend's, and the
   * public one — differs only in which battles it selects. What it does with them
   * afterwards is this: two further reads for the whole page, rather than a seat
   * and a log per battle, which would put a round trip on the page for every game
   * it shows. `limit` is the page size the rows were asked for plus one, so the
   * row past the end says whether another page exists without a count query.
   */
  private async hydrateBattles(
    rows: readonly BattleRow[],
    limit?: number,
  ): Promise<{ battles: (BattleHistory & { at: number })[]; nextCursor: BattlesCursor | null }> {
    const shown = limit === undefined ? rows : rows.slice(0, limit)
    const ids = shown.map((row) => row.id)
    const [players, logs] = await Promise.all([this.playersByBattles(ids), this.logsByBattles(ids)])
    const last = shown.at(-1)
    return {
      battles: shown.map((battle) => ({
        battle,
        at: battle.at,
        players: players.get(battle.id) ?? [],
        log: logs.get(battle.id) ?? [],
      })),
      nextCursor: limit !== undefined && rows.length > limit && last ? { at: last.at, id: last.id } : null,
    }
  }

  /**
   * Battles no seated player has withheld from the audience asked for.
   *
   * The narrowing is the database's, and it is expressed as the presence of a seat
   * that said no rather than the agreement of every seat: a player who has never
   * answered has no row at all, so asking every seat to agree would hide every
   * battle on an instance where nobody has opened the setting.
   * `src/core/battleAudience.ts` decides what those answers mean; this only names
   * the ones that rule a battle out.
   */
  private withheldFrom(audience: 'public' | 'friends') {
    const refused = audience === 'public' ? ne(battleSharing.audience, 'public') : eq(battleSharing.audience, 'private')
    const seat = alias(battleUsers, 'withholding_seat')
    return exists(
      this.database
        .select({ one: sql`1` })
        .from(battleSharing)
        .innerJoin(seat, eq(seat.userId, battleSharing.userId))
        .where(and(eq(seat.battleId, battles.id), refused)),
    )
  }

  /** Whether a given account holds a seat in the battle the outer query is on. */
  private seatOf(userId: string) {
    const seat = alias(battleUsers, 'viewer_seat')
    return exists(
      this.database
        .select({ one: sql`1` })
        .from(seat)
        .where(and(eq(seat.battleId, battles.id), eq(seat.userId, userId))),
    )
  }

  /**
   * A page of battles this player has a seat in, most recently active first,
   * with every log on the page.
   *
   * Ordered by the newest command rather than creation, so a battle being played
   * is always on the first page whatever its age, and only history pages behind
   * it grow with an account's lifetime.
   */
  async battlesByUser(userId: string, page?: { limit: number; before?: BattlesCursor; withUserId?: string }) {
    const activity = this.activityTime
    const theirs = alias(battleUsers, 'theirs')
    let query = this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: activity })
      .from(battles)
      .innerJoin(battleUsers, eq(battleUsers.battleId, battles.id))
      .leftJoin(commands, eq(commands.battleId, battles.id))
      .where(eq(battleUsers.userId, userId))
      .groupBy(battles.id)
      .having(this.resumeAfter(activity, page?.before))
      .orderBy(desc(activity), desc(battles.id))
      .$dynamic()
    if (page?.withUserId) {
      query = query.innerJoin(theirs, and(eq(theirs.battleId, battles.id), eq(theirs.userId, page.withUserId)))
    }
    return this.hydrateBattles(await (page ? query.limit(page.limit + 1) : query), page?.limit)
  }

  async battlesByLeagueEvent(leagueToken: string, eventToken: string, page: { limit: number; before?: BattlesCursor }) {
    const activity = this.activityTime
    const rows = await this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: activity })
      .from(leagueEventBattles)
      .innerJoin(leagueEvents, eq(leagueEvents.id, leagueEventBattles.eventId))
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .innerJoin(battles, eq(battles.id, leagueEventBattles.battleId))
      .leftJoin(commands, eq(commands.battleId, battles.id))
      .where(and(eq(leagues.token, leagueToken), eq(leagueEvents.token, eventToken), isNotNull(leagueEvents.revealedAt)))
      .groupBy(battles.id)
      .having(this.resumeAfter(activity, page.before))
      .orderBy(desc(activity), desc(battles.id))
      .limit(page.limit + 1)
    return this.hydrateBattles(rows, page.limit)
  }

  /**
   * Battles anyone may watch, most recently started first.
   *
   * Started rather than last touched, and finished games alongside running ones,
   * because this list is read to find a game to watch or to read back through.
   * Ordering by activity made the page reshuffle itself under a reader every time
   * anybody anywhere took a turn, and buried a battle that finished an hour ago
   * beneath one nobody has moved in since.
   *
   * `viewerId` drops the battles that viewer already sits in, because the page
   * asking for this has shown them their own games above and a reader counting
   * the same battle twice learns nothing the second time.
   */
  async publicBattles(page: { limit: number; before?: BattlesCursor; viewerId?: string | null }) {
    const rows = await this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: battles.createdAt })
      .from(battles)
      .where(
        and(not(this.withheldFrom('public')), page.viewerId ? not(this.seatOf(page.viewerId)) : undefined, this.startedBefore(page.before)),
      )
      .orderBy(desc(battles.createdAt), desc(battles.id))
      .limit(page.limit + 1)
    return this.hydrateBattles(rows, page.limit)
  }

  /**
   * Battles this player's confirmed friends are in and they are not.
   *
   * A friendship is mutual and settled, so either direction of the row counts.
   * Practice opponents are nobody's friend, so a friend's practice game arrives
   * here through the friend in it rather than needing a case of its own.
   */
  async battlesByFriends(userId: string, page: { limit: number; before?: BattlesCursor }) {
    const friend = alias(battleUsers, 'friend_seat')
    const friendship = exists(
      this.database
        .select({ one: sql`1` })
        .from(friendships)
        .where(
          and(
            isNotNull(friendships.acceptedAt),
            or(
              and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, friend.userId)),
              and(eq(friendships.addresseeId, userId), eq(friendships.requesterId, friend.userId)),
            ),
          ),
        ),
    )
    const rows = await this.database
      .selectDistinct({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: battles.createdAt })
      .from(battles)
      .innerJoin(friend, eq(friend.battleId, battles.id))
      .where(and(friendship, not(this.seatOf(userId)), not(this.withheldFrom('friends')), this.startedBefore(page.before)))
      .orderBy(desc(battles.createdAt), desc(battles.id))
      .limit(page.limit + 1)
    return this.hydrateBattles(rows, page.limit)
  }

  /** How widely these players allow their battles to be seen. Absent means the default. */
  async battleAudiences(userIds: readonly string[]) {
    const ids = [...new Set(userIds)]
    if (!ids.length) return new Map<string, BattleAudience>()
    const rows = await this.database
      .select({ userId: battleSharing.userId, audience: battleSharing.audience })
      .from(battleSharing)
      .where(inArray(battleSharing.userId, ids))
    return new Map(rows.map((row) => [row.userId, row.audience]))
  }

  /** One player's own answer, or the default they have never changed. */
  async battleAudience(userId: string): Promise<BattleAudience> {
    return (await this.battleAudiences([userId])).get(userId) ?? DEFAULT_BATTLE_AUDIENCE
  }

  async setBattleAudience(userId: string, audience: BattleAudience, now: number) {
    await this.database
      .insert(battleSharing)
      .values({ userId, audience, at: now })
      .onConflictDoUpdate({ target: battleSharing.userId, set: { audience, at: now } })
    return audience
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
        seated.filter((player) => player.automated).map((player) => player.id),
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
    waivedRules: string
    optionalRules?: string
    borrowedDetachmentId?: string | null
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
      waivedRules: input.waivedRules,
      optionalRules: input.optionalRules ?? '[]',
      borrowedDetachmentId: input.borrowedDetachmentId ?? null,
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

  async rosterSummariesByUser(userId: string) {
    return this.database
      .select({
        id: rosters.id,
        name: rosters.name,
        catalogueId: rosters.catalogueId,
        detachmentId: rosters.detachmentId,
        disposition: rosters.disposition,
        limit: rosters.limit,
        waivedRules: rosters.waivedRules,
        optionalRules: rosters.optionalRules,
        borrowedDetachmentId: rosters.borrowedDetachmentId,
        picks: rosters.picks,
        visibility: rosters.visibility,
        source: rosters.source,
        createdAt: rosters.createdAt,
        updatedAt: rosters.updatedAt,
      })
      .from(rosters)
      .where(eq(rosters.userId, userId))
      .orderBy(desc(rosters.createdAt))
  }

  async roster(id: string) {
    const [row] = await this.database.select().from(rosters).where(eq(rosters.id, id)).limit(1)
    return row
  }

  async createLeague(input: {
    id: string
    token: string
    eventId?: string
    eventToken?: string
    ownerId: string
    name: string
    description: string
    visibility: LeagueVisibility
    admission: LeagueAdmission
    playerLimit?: number | null
    recurring?: boolean
    format?: TableShape
    rosterLimit?: number
    now: number
  }) {
    await this.database.transaction(async (tx) => {
      await tx.insert(leagues).values({
        id: input.id,
        token: input.token,
        ownerId: input.ownerId,
        name: input.name,
        description: input.description,
        visibility: input.visibility,
        admission: input.admission,
        playerLimit: input.playerLimit ?? null,
        recurring: input.recurring ?? true,
        createdAt: input.now,
      })
      await tx.insert(leagueEvents).values({
        id: input.eventId ?? input.id,
        token: input.eventToken ?? input.token,
        leagueId: input.id,
        number: 1,
        format: input.format,
        rosterLimit: input.rosterLimit,
        createdAt: input.now,
      })
    })
  }

  async createLeagueEvent(input: {
    id: string
    token: string
    leagueToken: string
    ownerId: string
    format?: TableShape
    rosterLimit?: number
    now: number
  }): Promise<CreateLeagueEventResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId, playerLimit: leagues.playerLimit })
        .from(leagues)
        .where(eq(leagues.token, input.leagueToken))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== input.ownerId) return 'forbidden'
      if (input.format === '2v1' && league.playerLimit !== null && league.playerLimit < 3) return 'too-small'
      if (input.format === '2v2' && league.playerLimit !== null && (league.playerLimit < 4 || league.playerLimit % 2 !== 0))
        return 'too-small'
      const [latest] = await tx
        .select({ number: leagueEvents.number, revealedAt: leagueEvents.revealedAt })
        .from(leagueEvents)
        .where(eq(leagueEvents.leagueId, league.id))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!latest || latest.revealedAt === null) return 'open'
      await tx.insert(leagueEvents).values({
        id: input.id,
        token: input.token,
        leagueId: league.id,
        number: latest.number + 1,
        format: input.format,
        rosterLimit: input.rosterLimit,
        createdAt: input.now,
      })
      return 'created'
    })
  }

  /**
   * The rules an open event registers against, changeable until the first list is sealed.
   *
   * A change to the shape or the size makes every size assignment and team meaningless,
   * so they go with it rather than being carried into rules they were not made under.
   */
  async updateLeagueEvent(
    token: string,
    ownerId: string,
    rule: { format: TableShape; rosterLimit: number },
    eventToken?: string,
  ): Promise<UpdateLeagueEventResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId, playerLimit: leagues.playerLimit })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      if (rule.format === '2v1' && league.playerLimit !== null && league.playerLimit < 3) return 'too-small'
      if (rule.format === '2v2' && league.playerLimit !== null && (league.playerLimit < 4 || league.playerLimit % 2 !== 0))
        return 'too-small'
      const [event] = await tx
        .select({ id: leagueEvents.id, revealedAt: leagueEvents.revealedAt })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), eventToken ? eq(leagueEvents.token, eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event) return 'missing'
      if (event.revealedAt !== null) return 'closed'
      const [sealed] = await tx
        .select({ total: count() })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), isNotNull(leagueEventEntries.rosterSnapshot)))
      if ((sealed?.total ?? 0) > 0) return 'sealed'
      await tx.update(leagueEvents).set({ format: rule.format, rosterLimit: rule.rosterLimit }).where(eq(leagueEvents.id, event.id))
      await tx.update(leagueEventEntries).set({ requiredLimit: null, teamId: null }).where(eq(leagueEventEntries.eventId, event.id))
      return 'updated'
    })
  }

  async makeLeagueRecurring(token: string, ownerId: string): Promise<MakeLeagueRecurringResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId, recurring: leagues.recurring })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      if (!league.recurring) await tx.update(leagues).set({ recurring: true }).where(eq(leagues.id, league.id))
      return 'updated'
    })
  }

  async updateLeague(
    token: string,
    ownerId: string,
    input: {
      name: string
      description: string
      visibility: LeagueVisibility
      admission: LeagueAdmission
      playerLimit: number | null
    },
  ): Promise<UpdateLeagueResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({
          id: leagues.id,
          ownerId: leagues.ownerId,
          admission: leagues.admission,
          playerLimit: leagues.playerLimit,
        })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      const [current] = await tx
        .select({
          id: leagueEvents.id,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagueEvents)
        .where(eq(leagueEvents.leagueId, league.id))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!current) return 'missing'
      const [entries] = await tx
        .select({ total: count(), accepted: count(sql`case when ${leagueEventEntries.status} = 'accepted' then 1 end`) })
        .from(leagueEventEntries)
        .where(eq(leagueEventEntries.eventId, current.id))
      if (input.playerLimit !== league.playerLimit && current.revealedAt === null) {
        if (current.format === '2v1' && input.playerLimit !== null && input.playerLimit < 3) return 'team-minimum'
        if (current.format === '2v2' && input.playerLimit !== null && (input.playerLimit < 4 || input.playerLimit % 2 !== 0))
          return 'team-minimum'
        if (input.playerLimit !== null && input.playerLimit < (entries?.accepted ?? 0)) return 'below-accepted'
      }
      await tx.update(leagues).set(input).where(eq(leagues.id, league.id))
      // Automatic joining means nobody waits, so the requests already in the queue are
      // taken in the order they arrived until the configured places run out.
      if (input.admission === 'automatic' && league.admission === 'approval' && current.revealedAt === null) {
        const waiting = await tx
          .select({ userId: leagueEventEntries.userId })
          .from(leagueEventEntries)
          .where(and(eq(leagueEventEntries.eventId, current.id), eq(leagueEventEntries.status, 'pending')))
          .orderBy(asc(leagueEventEntries.joinedAt), asc(leagueEventEntries.userId))
        const places = input.playerLimit === null ? waiting.length : Math.max(0, input.playerLimit - (entries?.accepted ?? 0))
        const admitted = waiting.slice(0, places).map((entry) => entry.userId)
        if (admitted.length) {
          await tx
            .update(leagueEventEntries)
            .set({ status: 'accepted' })
            .where(and(eq(leagueEventEntries.eventId, current.id), inArray(leagueEventEntries.userId, admitted)))
        }
      }
      return 'updated'
    })
  }

  async deleteLeague(token: string, ownerId: string): Promise<DeleteLeagueResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      await tx.delete(leagues).where(eq(leagues.id, league.id))
      return 'deleted'
    })
  }

  async leaguesVisibleTo(userId: string | null, limit = 100) {
    return this.database.transaction(async (tx) => {
      const personal = userId
        ? or(
            eq(leagues.ownerId, userId),
            exists(
              tx
                .select({ one: sql`1` })
                .from(leagueEventEntries)
                .innerJoin(leagueEvents, eq(leagueEvents.id, leagueEventEntries.eventId))
                .where(and(eq(leagueEvents.leagueId, leagues.id), eq(leagueEventEntries.userId, userId))),
            ),
          )
        : undefined
      const visible = userId ? or(eq(leagues.visibility, 'public'), personal) : eq(leagues.visibility, 'public')
      const rows = await tx
        .select({
          id: leagues.id,
          token: leagues.token,
          ownerId: leagues.ownerId,
          ownerName: user.name,
          ownerImage: user.image,
          name: leagues.name,
          description: leagues.description,
          visibility: leagues.visibility,
          admission: leagues.admission,
          playerLimit: leagues.playerLimit,
          recurring: leagues.recurring,
          createdAt: leagues.createdAt,
          personal: personal ? sql<boolean>`${personal}` : sql<boolean>`false`,
        })
        .from(leagues)
        .innerJoin(user, eq(user.id, leagues.ownerId))
        .where(visible)
        .orderBy(
          ...(personal ? [asc(sql<number>`case when ${personal} then 0 else 1 end`), desc(leagues.createdAt)] : [desc(leagues.createdAt)]),
        )
        .limit(Math.min(Math.max(limit, 1), 100))
        .for('share', { of: leagues })
      if (!rows.length) return []
      const ids = rows.map((row) => row.id)
      const latestEvents = await tx
        .selectDistinctOn([leagueEvents.leagueId], {
          id: leagueEvents.id,
          token: leagueEvents.token,
          leagueId: leagueEvents.leagueId,
          number: leagueEvents.number,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagueEvents)
        .where(inArray(leagueEvents.leagueId, ids))
        .orderBy(leagueEvents.leagueId, desc(leagueEvents.number))
      const eventIds = latestEvents.map((event) => event.id)
      const [counts, ownEntries] = await Promise.all([
        tx
          .select({
            eventId: leagueEventEntries.eventId,
            joined: count(),
            accepted: count(sql`case when ${leagueEventEntries.status} = 'accepted' then 1 end`),
            occupied: count(sql`case when ${leagueEventEntries.status} <> 'rejected' then 1 end`),
          })
          .from(leagueEventEntries)
          .where(inArray(leagueEventEntries.eventId, eventIds))
          .groupBy(leagueEventEntries.eventId),
        userId
          ? tx
              .select({
                eventId: leagueEventEntries.eventId,
                status: leagueEventEntries.status,
                submitted: sql<boolean>`${leagueEventEntries.rosterSnapshot} is not null`,
                rosterName: leagueEventEntries.rosterName,
              })
              .from(leagueEventEntries)
              .where(and(inArray(leagueEventEntries.eventId, eventIds), eq(leagueEventEntries.userId, userId)))
          : Promise.resolve([]),
      ])
      const eventByLeague = new Map(latestEvents.map((event) => [event.leagueId, event]))
      const countByEvent = new Map(
        counts.map((entry) => [entry.eventId, { joined: entry.joined, accepted: entry.accepted, occupied: entry.occupied }]),
      )
      const ownByEvent = new Map(
        ownEntries.map((entry) => [entry.eventId, { status: entry.status, submitted: entry.submitted, rosterName: entry.rosterName }]),
      )
      return rows.flatMap((row) => {
        const event = eventByLeague.get(row.id)
        if (!event) return []
        return {
          ...row,
          eventToken: event.token,
          eventNumber: event.number,
          format: event.format,
          rosterLimit: event.rosterLimit,
          revealedAt: event.revealedAt,
          entrantCount: countByEvent.get(event.id)?.accepted ?? 0,
          currentEntrantCount: countByEvent.get(event.id)?.joined ?? 0,
          occupiedCount: countByEvent.get(event.id)?.occupied ?? 0,
          ownEntry: ownByEvent.get(event.id) ?? null,
        }
      })
    })
  }

  async leagueBattleCandidates(userId: string, participantIds: readonly string[]): Promise<LeagueBattleCandidate[]> {
    return this.database.transaction(async (tx) => {
      const ownEntry = alias(leagueEventEntries, 'own_entry')
      const participantEntry = alias(leagueEventEntries, 'participant_entry')
      const events = await tx
        .select({
          id: leagueEvents.id,
          token: leagues.token,
          name: leagues.name,
          eventToken: leagueEvents.token,
          eventNumber: leagueEvents.number,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
        })
        .from(ownEntry)
        .innerJoin(leagueEvents, eq(leagueEvents.id, ownEntry.eventId))
        .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
        .innerJoin(
          participantEntry,
          and(
            eq(participantEntry.eventId, leagueEvents.id),
            inArray(participantEntry.userId, participantIds),
            eq(participantEntry.status, 'accepted'),
            isNotNull(participantEntry.rosterSnapshot),
          ),
        )
        .where(
          and(
            eq(ownEntry.userId, userId),
            eq(ownEntry.status, 'accepted'),
            isNotNull(ownEntry.rosterSnapshot),
            isNotNull(leagueEvents.revealedAt),
          ),
        )
        .groupBy(leagueEvents.id, leagues.id)
        .having(sql`count(${participantEntry.userId}) = ${participantIds.length}`)
        .orderBy(desc(leagueEvents.revealedAt), desc(leagueEvents.number))
        .limit(LEAGUE_BATTLE_CANDIDATE_MAX)
      if (!events.length) return []
      const entries = await tx
        .select({
          eventId: leagueEventEntries.eventId,
          userId: leagueEventEntries.userId,
          requiredLimit: leagueEventEntries.requiredLimit,
          snapshot: leagueEventEntries.rosterSnapshot,
          teamId: leagueEventEntries.teamId,
        })
        .from(leagueEventEntries)
        .where(
          and(
            inArray(
              leagueEventEntries.eventId,
              events.map((event) => event.id),
            ),
            inArray(leagueEventEntries.userId, participantIds),
            eq(leagueEventEntries.status, 'accepted'),
            isNotNull(leagueEventEntries.rosterSnapshot),
          ),
        )
      const entriesByEvent = new Map<string, typeof entries>()
      for (const entry of entries) {
        const grouped = entriesByEvent.get(entry.eventId) ?? []
        grouped.push(entry)
        entriesByEvent.set(entry.eventId, grouped)
      }
      return events.flatMap((event) => {
        const eventEntries = entriesByEvent.get(event.id) ?? []
        if (eventEntries.length !== participantIds.length) return []
        const { id: _eventId, ...candidate } = event
        return [
          {
            ...candidate,
            entries: eventEntries.map(({ eventId: _entryEventId, snapshot, ...entry }) => ({
              ...entry,
              sealedLimit: event.format === null ? frozenRosterLimit(snapshot) : null,
            })),
          },
        ]
      })
    })
  }

  async leagueByToken(token: string, viewerId: string | null = null, eventToken?: string) {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({
          id: leagues.id,
          token: leagues.token,
          ownerId: leagues.ownerId,
          ownerName: user.name,
          ownerImage: user.image,
          name: leagues.name,
          description: leagues.description,
          visibility: leagues.visibility,
          admission: leagues.admission,
          playerLimit: leagues.playerLimit,
          recurring: leagues.recurring,
          createdAt: leagues.createdAt,
        })
        .from(leagues)
        .innerJoin(user, eq(user.id, leagues.ownerId))
        .where(eq(leagues.token, token))
        .limit(1)
        .for('share', { of: leagues })
      if (!league) return undefined
      const [events, [eventTotal]] = await Promise.all([
        tx
          .select({
            id: leagueEvents.id,
            token: leagueEvents.token,
            number: leagueEvents.number,
            format: leagueEvents.format,
            rosterLimit: leagueEvents.rosterLimit,
            createdAt: leagueEvents.createdAt,
            revealedAt: leagueEvents.revealedAt,
          })
          .from(leagueEvents)
          .where(eq(leagueEvents.leagueId, league.id))
          .orderBy(desc(leagueEvents.number))
          .limit(100),
        tx.select({ value: count() }).from(leagueEvents).where(eq(leagueEvents.leagueId, league.id)),
      ])
      let selected = eventToken ? events.find((event) => event.token === eventToken) : events[0]
      if (!selected && eventToken) {
        const [older] = await tx
          .select({
            id: leagueEvents.id,
            token: leagueEvents.token,
            number: leagueEvents.number,
            format: leagueEvents.format,
            rosterLimit: leagueEvents.rosterLimit,
            createdAt: leagueEvents.createdAt,
            revealedAt: leagueEvents.revealedAt,
          })
          .from(leagueEvents)
          .where(and(eq(leagueEvents.leagueId, league.id), eq(leagueEvents.token, eventToken)))
          .limit(1)
        selected = older
      }
      const current = events[0]
      if (!selected || !current) return undefined
      const visibleEvents = events.some((event) => event.id === selected.id)
        ? events
        : [selected, ...events.slice(0, 99)].toSorted((left, right) => right.number - left.number)
      const [entries, [currentCounts]] = await Promise.all([
        tx
          .select({
            userId: leagueEventEntries.userId,
            name: user.name,
            image: user.image,
            status: leagueEventEntries.status,
            joinedAt: leagueEventEntries.joinedAt,
            submitted: sql<boolean>`${leagueEventEntries.rosterSnapshot} is not null`,
            assignedLimit: leagueEventEntries.requiredLimit,
            snapshot: leagueEventEntries.rosterSnapshot,
            teamId: leagueEventEntries.teamId,
            rosterName: viewerId
              ? sql<string | null>`case when ${leagueEventEntries.userId} = ${viewerId} then ${leagueEventEntries.rosterName} else null end`
              : sql<string | null>`null`,
          })
          .from(leagueEventEntries)
          .innerJoin(user, eq(user.id, leagueEventEntries.userId))
          .where(
            and(
              eq(leagueEventEntries.eventId, selected.id),
              viewerId
                ? or(ne(leagueEventEntries.status, 'rejected'), eq(leagueEventEntries.userId, viewerId))
                : ne(leagueEventEntries.status, 'rejected'),
            ),
          )
          .orderBy(asc(leagueEventEntries.joinedAt), asc(leagueEventEntries.userId)),
        tx
          .select({ total: count(), accepted: count(sql`case when ${leagueEventEntries.status} = 'accepted' then 1 end`) })
          .from(leagueEventEntries)
          .where(eq(leagueEventEntries.eventId, current.id)),
      ])
      return {
        ...league,
        eventToken: selected.token,
        eventNumber: selected.number,
        eventCreatedAt: selected.createdAt,
        format: selected.format,
        rosterLimit: selected.rosterLimit,
        revealedAt: selected.revealedAt,
        eventCount: eventTotal?.value ?? events.length,
        currentEventFormat: current.format,
        currentEventRevealedAt: current.revealedAt,
        currentEntrantCount: currentCounts?.total ?? 0,
        currentAcceptedCount: currentCounts?.accepted ?? 0,
        events: visibleEvents.map(({ id: _id, ...event }) => event),
        occupiedCount: entries.filter((entry) => entry.status !== 'rejected').length,
        entries: entries.map(({ assignedLimit, snapshot, ...entry }) => ({
          ...entry,
          requiredLimit: requiredLeagueRosterLimit(selected.format, selected.rosterLimit, assignedLimit, entry.teamId),
          sealedLimit: selected.format === null && selected.revealedAt !== null ? frozenRosterLimit(snapshot) : null,
        })),
      }
    })
  }

  async joinLeague(token: string, userId: string, now: number, memberLimit: number, eventToken?: string): Promise<JoinLeagueResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId, admission: leagues.admission, playerLimit: leagues.playerLimit })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      const [event] = await tx
        .select({ id: leagueEvents.id, format: leagueEvents.format, revealedAt: leagueEvents.revealedAt })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), eventToken ? eq(leagueEvents.token, eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event) return 'missing'
      if (event.revealedAt !== null) return 'closed'
      const [existing] = await tx
        .select({ status: leagueEventEntries.status })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, userId)))
        .limit(1)
      if (existing?.status && existing.status !== 'rejected') return existing.status
      const [members] = await tx
        .select({ active: count(), accepted: count(sql`case when ${leagueEventEntries.status} = 'accepted' then 1 end`) })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), ne(leagueEventEntries.status, 'rejected')))
      const full =
        league.admission === 'approval' && league.playerLimit !== null
          ? (members?.accepted ?? 0) >= league.playerLimit || (members?.active ?? 0) >= memberLimit
          : (members?.active ?? 0) >= (league.playerLimit ?? memberLimit)
      if (full) return 'full'
      // The organizer approves entrants, so approving themselves is a click with no question in it.
      const status = league.admission === 'automatic' || league.ownerId === userId ? 'accepted' : 'pending'
      if (existing) {
        await tx
          .update(leagueEventEntries)
          .set({ status, joinedAt: now })
          .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, userId)))
      } else {
        await tx.insert(leagueEventEntries).values({ eventId: event.id, userId, status, joinedAt: now })
      }
      return status
    })
  }

  async moderateLeagueEntry(
    token: string,
    ownerId: string,
    userId: string,
    status: Extract<LeagueEntryStatus, 'accepted' | 'rejected'>,
    memberLimit: number,
    eventToken?: string,
  ): Promise<ModerateLeagueResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId, playerLimit: leagues.playerLimit })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      const [event] = await tx
        .select({ id: leagueEvents.id, revealedAt: leagueEvents.revealedAt })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), eventToken ? eq(leagueEvents.token, eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event) return 'missing'
      if (event.revealedAt !== null) return 'closed'
      const [entry] = await tx
        .select({ status: leagueEventEntries.status, teamId: leagueEventEntries.teamId })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, userId)))
        .limit(1)
      if (!entry) return 'missing'
      if (status === 'accepted' && entry.status !== 'accepted') {
        const [members] = await tx
          .select({ active: count(), accepted: count(sql`case when ${leagueEventEntries.status} = 'accepted' then 1 end`) })
          .from(leagueEventEntries)
          .where(and(eq(leagueEventEntries.eventId, event.id), ne(leagueEventEntries.status, 'rejected')))
        if (league.playerLimit !== null && (members?.accepted ?? 0) >= league.playerLimit) return 'full'
        if (entry.status === 'rejected' && (members?.active ?? 0) >= memberLimit) return 'full'
      }
      if (status === 'rejected' && entry.teamId) {
        await tx
          .update(leagueEventEntries)
          .set({ teamId: null, requiredLimit: null, rosterId: null, rosterName: null, rosterSnapshot: null, submittedAt: null })
          .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.teamId, entry.teamId)))
      }
      const updated = await tx
        .update(leagueEventEntries)
        .set(
          status === 'rejected'
            ? { status, rosterId: null, rosterName: null, rosterSnapshot: null, submittedAt: null, requiredLimit: null, teamId: null }
            : { status },
        )
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, userId)))
        .returning({ userId: leagueEventEntries.userId })
      return updated.length ? 'updated' : 'missing'
    })
  }

  async assignLeagueRosterRequirement(
    token: string,
    ownerId: string,
    userId: string,
    requiredLimit: number,
    eventToken?: string,
  ): Promise<AssignLeagueRosterRequirementResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      const [event] = await tx
        .select({
          id: leagueEvents.id,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), eventToken ? eq(leagueEvents.token, eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event) return 'missing'
      if (event.revealedAt !== null) return 'closed'
      if (event.format !== '2v1') return 'wrong-format'
      if (requiredLimit !== event.rosterLimit && requiredLimit !== alliedLeagueRosterLimit(event.rosterLimit ?? 0)) return 'wrong-limit'
      const [entry] = await tx
        .select({ requiredLimit: leagueEventEntries.requiredLimit })
        .from(leagueEventEntries)
        .where(
          and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, userId), eq(leagueEventEntries.status, 'accepted')),
        )
        .limit(1)
        .for('update')
      if (!entry) return 'missing'
      if (entry.requiredLimit !== requiredLimit) {
        await tx
          .update(leagueEventEntries)
          .set({ requiredLimit, rosterId: null, rosterName: null, rosterSnapshot: null, submittedAt: null })
          .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, userId)))
      }
      return 'updated'
    })
  }

  async assignLeagueTeam(
    token: string,
    ownerId: string,
    userIds: readonly string[],
    teamId: string,
    eventToken?: string,
  ): Promise<AssignLeagueTeamResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league) return 'missing'
      if (league.ownerId !== ownerId) return 'forbidden'
      const [event] = await tx
        .select({
          id: leagueEvents.id,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), eventToken ? eq(leagueEvents.token, eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event) return 'missing'
      if (event.revealedAt !== null) return 'closed'
      if (event.format !== '2v2' || event.rosterLimit === null) return 'wrong-format'
      const uniqueIds = [...new Set(userIds)]
      if (uniqueIds.length < 1 || uniqueIds.length > 2) return 'missing'
      const targets = await tx
        .select({ userId: leagueEventEntries.userId, teamId: leagueEventEntries.teamId })
        .from(leagueEventEntries)
        .where(
          and(
            eq(leagueEventEntries.eventId, event.id),
            inArray(leagueEventEntries.userId, uniqueIds),
            eq(leagueEventEntries.status, 'accepted'),
          ),
        )
        .for('update')
      if (targets.length !== uniqueIds.length) return 'missing'
      const previousTeamId = targets[0]?.teamId
      if (uniqueIds.length === 2 && previousTeamId && targets.every((entry) => entry.teamId === previousTeamId)) return 'updated'
      const oldTeamIds = targets.flatMap((entry) => (entry.teamId ? [entry.teamId] : []))
      const formerPartners = oldTeamIds.length
        ? await tx
            .select({ userId: leagueEventEntries.userId })
            .from(leagueEventEntries)
            .where(and(eq(leagueEventEntries.eventId, event.id), inArray(leagueEventEntries.teamId, oldTeamIds)))
            .for('update')
        : []
      const affectedIds = [...new Set([...uniqueIds, ...formerPartners.map((entry) => entry.userId)])]
      await tx
        .update(leagueEventEntries)
        .set({ teamId: null, requiredLimit: null, rosterId: null, rosterName: null, rosterSnapshot: null, submittedAt: null })
        .where(and(eq(leagueEventEntries.eventId, event.id), inArray(leagueEventEntries.userId, affectedIds)))
      if (uniqueIds.length === 2) {
        await tx
          .update(leagueEventEntries)
          .set({ teamId, requiredLimit: alliedLeagueRosterLimit(event.rosterLimit) })
          .where(and(eq(leagueEventEntries.eventId, event.id), inArray(leagueEventEntries.userId, uniqueIds)))
      }
      return 'updated'
    })
  }

  async submitLeagueRoster(input: {
    token: string
    userId: string
    rosterId: string
    rosterName: string
    rosterLimit?: number
    rosterUpdatedAt: number
    snapshot: string
    now: number
    eventToken?: string
  }): Promise<SubmitLeagueRosterResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx.select({ id: leagues.id }).from(leagues).where(eq(leagues.token, input.token)).for('update')
      if (!league) return { outcome: 'missing' }
      const [event] = await tx
        .select({
          id: leagueEvents.id,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), input.eventToken ? eq(leagueEvents.token, input.eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event || event.revealedAt !== null) return { outcome: 'missing' }
      const [entry] = await tx
        .select({ status: leagueEventEntries.status, requiredLimit: leagueEventEntries.requiredLimit, teamId: leagueEventEntries.teamId })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, input.userId)))
        .limit(1)
        .for('update')
      if (!entry || entry.status !== 'accepted') return { outcome: 'missing' }
      const requiredLimit = requiredLeagueRosterLimit(event.format, event.rosterLimit, entry.requiredLimit, entry.teamId)
      if ((event.format === '2v1' || event.format === '2v2') && requiredLimit === null) return { outcome: 'unassigned' }
      if (requiredLimit !== null && input.rosterLimit !== requiredLimit) return { outcome: 'wrong-limit' }
      let submitted: Roster
      try {
        submitted = parseRosterSnapshot(input.snapshot)
      } catch {
        return { outcome: 'missing' }
      }
      const submittedWarlords = warlordSelection([submitted])
      if (event.format !== '2v2' && (!submittedWarlords.eligible || submittedWarlords.count !== 1))
        return { outcome: 'invalid-warlords', format: event.format }
      if (event.format === '2v2') {
        const [teammate] = await tx
          .select({ snapshot: leagueEventEntries.rosterSnapshot })
          .from(leagueEventEntries)
          .where(
            and(
              eq(leagueEventEntries.eventId, event.id),
              eq(leagueEventEntries.teamId, entry.teamId!),
              ne(leagueEventEntries.userId, input.userId),
              eq(leagueEventEntries.status, 'accepted'),
            ),
          )
          .limit(1)
          .for('update')
        if (!teammate) return { outcome: 'unassigned' }
        if (!submittedWarlords.eligible || submittedWarlords.count > 1) return { outcome: 'invalid-warlords', format: event.format }
        if (teammate.snapshot !== null) {
          let teammateRoster: Roster
          try {
            teammateRoster = parseRosterSnapshot(teammate.snapshot)
          } catch {
            return { outcome: 'missing' }
          }
          const teamWarlords = warlordSelection([submitted, teammateRoster])
          if (!teamWarlords.eligible || teamWarlords.count !== 1) return { outcome: 'invalid-warlords', format: event.format }
        }
      }
      const updated = await tx
        .update(leagueEventEntries)
        .set({ rosterId: input.rosterId, rosterName: input.rosterName, rosterSnapshot: input.snapshot, submittedAt: input.now })
        .where(
          and(
            eq(leagueEventEntries.eventId, event.id),
            eq(leagueEventEntries.userId, input.userId),
            eq(leagueEventEntries.status, 'accepted'),
            exists(
              tx
                .select({ one: sql`1` })
                .from(rosters)
                .where(
                  and(
                    eq(rosters.id, input.rosterId),
                    eq(rosters.userId, input.userId),
                    eq(rosters.updatedAt, input.rosterUpdatedAt),
                    requiredLimit === null ? undefined : eq(rosters.limit, requiredLimit),
                  ),
                ),
            ),
          ),
        )
        .returning({ userId: leagueEventEntries.userId })
      return updated.length ? { outcome: 'sealed', format: event.format, requiredLimit } : { outcome: 'missing' }
    })
  }

  async revealLeague(token: string, ownerId: string, now: number, eventToken?: string): Promise<RevealLeagueResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId, playerLimit: leagues.playerLimit })
        .from(leagues)
        .where(eq(leagues.token, token))
        .for('update')
      if (!league || league.ownerId !== ownerId) return { outcome: 'not-ready' }
      const [event] = await tx
        .select({
          id: leagueEvents.id,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagueEvents)
        .where(and(eq(leagueEvents.leagueId, league.id), eventToken ? eq(leagueEvents.token, eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('update')
      if (!event || event.revealedAt !== null) return { outcome: 'not-ready' }
      const entries = await tx
        .select({
          requiredLimit: leagueEventEntries.requiredLimit,
          teamId: leagueEventEntries.teamId,
          snapshot: leagueEventEntries.rosterSnapshot,
        })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'accepted')))
      if (!entries.length || (league.playerLimit !== null && entries.length !== league.playerLimit)) return { outcome: 'not-ready' }
      if (entries.some((entry) => entry.snapshot === null || (event.format === '2v1' && entry.requiredLimit === null)))
        return { outcome: 'not-ready' }
      let snapshots: ReturnType<typeof parseRosterSnapshot>[] = []
      if (event.format !== null) {
        try {
          snapshots = entries.map((entry) => parseRosterSnapshot(entry.snapshot!))
        } catch {
          return { outcome: 'not-ready' }
        }
      }
      if (event.format === '2v1') {
        const solo = entries.filter((entry) => entry.requiredLimit === event.rosterLimit).length
        const allied = entries.filter((entry) => entry.requiredLimit === alliedLeagueRosterLimit(event.rosterLimit ?? 0)).length
        if (!solo || allied < 2) return { outcome: 'not-ready' }
      }
      if (event.format !== null && event.format !== '2v2') {
        const invalidWarlord = snapshots.some((snapshot) => {
          const selection = warlordSelection([snapshot], true)
          return !selection.eligible || selection.count !== 1
        })
        if (invalidWarlord) return { outcome: 'invalid-warlords', format: event.format }
      }
      if (event.format === '2v2') {
        if (entries.length < 4 || entries.length % 2 !== 0 || entries.some((entry) => entry.teamId === null))
          return { outcome: 'not-ready' }
        const teams = new Map<string, Roster[]>()
        entries.forEach((entry, index) => {
          const teamRosters = teams.get(entry.teamId!) ?? []
          teamRosters.push(snapshots[index]!)
          teams.set(entry.teamId!, teamRosters)
        })
        if (teams.size < 2 || [...teams.values()].some((teamRosters) => teamRosters.length !== 2)) return { outcome: 'not-ready' }
        const invalidWarlord = [...teams.values()].some((teamRosters) => {
          const selection = warlordSelection(teamRosters)
          return !selection.eligible || selection.count !== 1
        })
        if (invalidWarlord) return { outcome: 'invalid-warlords', format: event.format }
        const [pending] = await tx
          .select({ value: count() })
          .from(leagueEventEntries)
          .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'pending')))
        if ((pending?.value ?? 0) > 0) return { outcome: 'not-ready' }
      }
      if (
        event.format !== null &&
        entries.some((entry, index) => {
          const requiredLimit = requiredLeagueRosterLimit(event.format, event.rosterLimit, entry.requiredLimit, entry.teamId)
          return requiredLimit === null || snapshots[index]!.built?.limit !== requiredLimit
        })
      )
        return { outcome: 'not-ready' }
      await tx
        .update(leagueEventEntries)
        .set({ status: 'rejected' })
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.status, 'pending')))
      await tx.update(leagueEvents).set({ revealedAt: now }).where(eq(leagueEvents.id, event.id))
      return { outcome: 'revealed' }
    })
  }

  async leagueRoster(token: string, userId: string, eventToken?: string) {
    const [row] = await this.database
      .select({ snapshot: leagueEventEntries.rosterSnapshot })
      .from(leagueEventEntries)
      .innerJoin(leagueEvents, eq(leagueEvents.id, leagueEventEntries.eventId))
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .where(
        and(
          eq(leagues.token, token),
          eventToken ? eq(leagueEvents.token, eventToken) : undefined,
          isNotNull(leagueEvents.revealedAt),
          eq(leagueEventEntries.userId, userId),
          eq(leagueEventEntries.status, 'accepted'),
          isNotNull(leagueEventEntries.rosterSnapshot),
        ),
      )
      .orderBy(desc(leagueEvents.number))
      .limit(1)
    return row?.snapshot ?? null
  }

  async createLeagueBattle<T>(
    input: {
      id: string
      token: string
      leagueToken: string
      eventToken?: string
      userId: string
      userIds: string[]
      now: number
    },
    prepare: (league: {
      eventToken: string
      format: TableShape | null
      rosterLimit: number | null
      revealedAt: number | null
      entries: { userId: string; requiredLimit: number | null; snapshot: string | null; teamId: string | null }[]
    }) =>
      | { allyIds: string[]; opponentIds: string[]; initialCommands: Command[]; result: T }
      | Promise<{ allyIds: string[]; opponentIds: string[]; initialCommands: Command[]; result: T }>,
  ): Promise<T | undefined> {
    return this.database.transaction(async (tx) => {
      const [event] = await tx
        .select({
          id: leagueEvents.id,
          token: leagueEvents.token,
          format: leagueEvents.format,
          rosterLimit: leagueEvents.rosterLimit,
          revealedAt: leagueEvents.revealedAt,
        })
        .from(leagues)
        .innerJoin(leagueEvents, eq(leagueEvents.leagueId, leagues.id))
        .where(and(eq(leagues.token, input.leagueToken), input.eventToken ? eq(leagueEvents.token, input.eventToken) : undefined))
        .orderBy(desc(leagueEvents.number))
        .limit(1)
        .for('share', { of: leagues })
      if (!event) return undefined
      const entries = await tx
        .select({
          userId: leagueEventEntries.userId,
          requiredLimit: leagueEventEntries.requiredLimit,
          snapshot: leagueEventEntries.rosterSnapshot,
          teamId: leagueEventEntries.teamId,
        })
        .from(leagueEventEntries)
        .where(
          and(
            eq(leagueEventEntries.eventId, event.id),
            event.format === '2v2' ? undefined : inArray(leagueEventEntries.userId, input.userIds),
            eq(leagueEventEntries.status, 'accepted'),
            isNotNull(leagueEventEntries.rosterSnapshot),
          ),
        )
        .orderBy(asc(leagueEventEntries.joinedAt), asc(leagueEventEntries.userId))
      const prepared = await prepare({
        eventToken: event.token,
        format: event.format,
        rosterLimit: event.rosterLimit,
        revealedAt: event.revealedAt,
        entries,
      })
      await this.insertBattle(tx, {
        id: input.id,
        token: input.token,
        userId: input.userId,
        allyIds: prepared.allyIds,
        opponentIds: prepared.opponentIds,
        initialCommands: prepared.initialCommands,
        now: input.now,
      })
      await tx.insert(leagueEventBattles).values({ battleId: input.id, eventId: event.id })
      return prepared.result
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
    return rows.map(toLoggedCommand).filter((command) => command !== null)
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
      const command = toLoggedCommand(row)
      if (!command) continue
      const log = grouped.get(row.battleId) ?? []
      log.push(command)
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

/**
 * Reads one stored row back into a command, or `null` if it cannot.
 *
 * A row with a `kind` this replica does not recognise fails the schema closed —
 * the same rule the rest of the domain follows. A rolling deploy runs both
 * versions at once, so an old replica reads a command kind a new replica already
 * wrote. Skipping that one row degrades its battle; parsing it fails the whole
 * list, because one log feeds every battle a player owns.
 */
function toLoggedCommand(row: { seq: number; by: string; at: number; body: string }): LoggedCommand | null {
  const command = commandSchema.safeParse(JSON.parse(row.body))
  if (!command.success) return null
  return { seq: row.seq, by: row.by, at: row.at, command: command.data }
}
