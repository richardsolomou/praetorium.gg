import { and, asc, desc, eq, exists, inArray, isNotNull, lt, ne, not, or, type SQL, sql } from 'drizzle-orm'
import { type Command, type LoggedCommand, reduceBattle, type SubmitResult, validate } from '../core/battle'
import { commandSchema } from '../core/commands'
import { type BattleAudience, DEFAULT_BATTLE_AUDIENCE } from '../core/battleAudience'
import type { BattlesCursor } from '../contracts/battles'
import { alias } from 'drizzle-orm/pg-core'
import type { PraetoriumDatabase } from './connection'
import { LeagueRepository } from './repositories/leagueRepository'
import { AccountRepository } from './repositories/accountRepository'
import { NotificationRepository } from './repositories/notificationRepository'
import { RosterRepository } from './repositories/rosterRepository'
import {
  battleSharing,
  battleUsers,
  battles,
  commands,
  friendships,
  leagueEventBattles,
  leagueEvents,
  leagues,
  practiceOpponents,
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
export type { BattlesCursor } from '../contracts/battles'
export type { UnlinkAccountResult } from './repositories/accountRepository'
export type {
  JoinLeagueResult,
  ModerateLeagueResult,
  CreateLeagueEventResult,
  MakeLeagueRecurringResult,
  UpdateLeagueResult,
  UpdateLeagueEventResult,
  DeleteLeagueResult,
  AssignLeagueRosterRequirementResult,
  AssignLeagueTeamResult,
  SubmitLeagueRosterResult,
  RevealLeagueResult,
  UnsealLeagueRosterResult,
  LeagueBattleCandidate,
} from './repositories/leagueRepository'

/**
 * Whether the account in a seat is a practice opponent.
 *
 * Read from the join rather than a second query keyed on the ids the seats just
 * returned: it is the same answer, and every battle read goes through here.
 */
const AUTOMATED = sql<boolean>`${practiceOpponents.userId} is not null`

export class Repository {
  private readonly accountRepository: AccountRepository
  private readonly leagueRepository: LeagueRepository
  private readonly notificationRepository: NotificationRepository
  private readonly rosterRepository: RosterRepository
  readonly createLeagueBattle: LeagueRepository['createLeagueBattle']

  constructor(private readonly database: PraetoriumDatabase) {
    this.accountRepository = new AccountRepository(database)
    this.leagueRepository = new LeagueRepository(database, (tx, input) => this.insertBattle(tx, input))
    this.notificationRepository = new NotificationRepository(database)
    this.rosterRepository = new RosterRepository(database)
    this.createLeagueBattle = this.leagueRepository.createLeagueBattle.bind(this.leagueRepository)
  }

  createLeague(...args: Parameters<LeagueRepository['createLeague']>) {
    return this.leagueRepository.createLeague(...args)
  }

  createLeagueEvent(...args: Parameters<LeagueRepository['createLeagueEvent']>) {
    return this.leagueRepository.createLeagueEvent(...args)
  }

  updateLeagueEvent(...args: Parameters<LeagueRepository['updateLeagueEvent']>) {
    return this.leagueRepository.updateLeagueEvent(...args)
  }

  makeLeagueRecurring(...args: Parameters<LeagueRepository['makeLeagueRecurring']>) {
    return this.leagueRepository.makeLeagueRecurring(...args)
  }

  updateLeague(...args: Parameters<LeagueRepository['updateLeague']>) {
    return this.leagueRepository.updateLeague(...args)
  }

  deleteLeague(...args: Parameters<LeagueRepository['deleteLeague']>) {
    return this.leagueRepository.deleteLeague(...args)
  }

  leaguesVisibleTo(...args: Parameters<LeagueRepository['leaguesVisibleTo']>) {
    return this.leagueRepository.leaguesVisibleTo(...args)
  }

  leagueBattleCandidates(...args: Parameters<LeagueRepository['leagueBattleCandidates']>) {
    return this.leagueRepository.leagueBattleCandidates(...args)
  }

  leagueByToken(...args: Parameters<LeagueRepository['leagueByToken']>) {
    return this.leagueRepository.leagueByToken(...args)
  }

  joinLeague(...args: Parameters<LeagueRepository['joinLeague']>) {
    return this.leagueRepository.joinLeague(...args)
  }

  moderateLeagueEntry(...args: Parameters<LeagueRepository['moderateLeagueEntry']>) {
    return this.leagueRepository.moderateLeagueEntry(...args)
  }

  assignLeagueRosterRequirement(...args: Parameters<LeagueRepository['assignLeagueRosterRequirement']>) {
    return this.leagueRepository.assignLeagueRosterRequirement(...args)
  }

  assignLeagueTeam(...args: Parameters<LeagueRepository['assignLeagueTeam']>) {
    return this.leagueRepository.assignLeagueTeam(...args)
  }

  submitLeagueRoster(...args: Parameters<LeagueRepository['submitLeagueRoster']>) {
    return this.leagueRepository.submitLeagueRoster(...args)
  }

  revealLeague(...args: Parameters<LeagueRepository['revealLeague']>) {
    return this.leagueRepository.revealLeague(...args)
  }

  unsealLeagueRoster(...args: Parameters<LeagueRepository['unsealLeagueRoster']>) {
    return this.leagueRepository.unsealLeagueRoster(...args)
  }

  leagueRosters(...args: Parameters<LeagueRepository['leagueRosters']>) {
    return this.leagueRepository.leagueRosters(...args)
  }

  userById(...args: Parameters<AccountRepository['userById']>) {
    return this.accountRepository.userById(...args)
  }

  onboardingProgress(...args: Parameters<AccountRepository['onboardingProgress']>) {
    return this.accountRepository.onboardingProgress(...args)
  }

  updateOnboardingProgress(...args: Parameters<AccountRepository['updateOnboardingProgress']>) {
    return this.accountRepository.updateOnboardingProgress(...args)
  }

  adminUsers(...args: Parameters<AccountRepository['adminUsers']>) {
    return this.accountRepository.adminUsers(...args)
  }

  unlinkAccount(...args: Parameters<AccountRepository['unlinkAccount']>) {
    return this.accountRepository.unlinkAccount(...args)
  }

  profileByUserId(...args: Parameters<AccountRepository['profileByUserId']>) {
    return this.accountRepository.profileByUserId(...args)
  }

  namesByIds(...args: Parameters<AccountRepository['namesByIds']>) {
    return this.accountRepository.namesByIds(...args)
  }

  searchPlayers(...args: Parameters<AccountRepository['searchPlayers']>) {
    return this.accountRepository.searchPlayers(...args)
  }

  practiceOpponents(...args: Parameters<AccountRepository['practiceOpponents']>) {
    return this.accountRepository.practiceOpponents(...args)
  }

  relationships(...args: Parameters<AccountRepository['relationships']>) {
    return this.accountRepository.relationships(...args)
  }

  requestFriend(...args: Parameters<AccountRepository['requestFriend']>) {
    return this.accountRepository.requestFriend(...args)
  }

  acceptFriend(...args: Parameters<AccountRepository['acceptFriend']>) {
    return this.accountRepository.acceptFriend(...args)
  }

  removeFriend(...args: Parameters<AccountRepository['removeFriend']>) {
    return this.accountRepository.removeFriend(...args)
  }

  friendInviteByInviter(...args: Parameters<AccountRepository['friendInviteByInviter']>) {
    return this.accountRepository.friendInviteByInviter(...args)
  }

  friendInviteByToken(...args: Parameters<AccountRepository['friendInviteByToken']>) {
    return this.accountRepository.friendInviteByToken(...args)
  }

  replaceFriendInvite(...args: Parameters<AccountRepository['replaceFriendInvite']>) {
    return this.accountRepository.replaceFriendInvite(...args)
  }

  cancelFriendInvite(...args: Parameters<AccountRepository['cancelFriendInvite']>) {
    return this.accountRepository.cancelFriendInvite(...args)
  }

  acceptFriendInvite(...args: Parameters<AccountRepository['acceptFriendInvite']>) {
    return this.accountRepository.acceptFriendInvite(...args)
  }

  pushEnabled(...args: Parameters<NotificationRepository['pushEnabled']>) {
    return this.notificationRepository.pushEnabled(...args)
  }

  setPushEnabled(...args: Parameters<NotificationRepository['setPushEnabled']>) {
    return this.notificationRepository.setPushEnabled(...args)
  }

  registerPushToken(...args: Parameters<NotificationRepository['registerPushToken']>) {
    return this.notificationRepository.registerPushToken(...args)
  }

  unregisterPushToken(...args: Parameters<NotificationRepository['unregisterPushToken']>) {
    return this.notificationRepository.unregisterPushToken(...args)
  }

  deletePushTokens(...args: Parameters<NotificationRepository['deletePushTokens']>) {
    return this.notificationRepository.deletePushTokens(...args)
  }

  pushTargets(...args: Parameters<NotificationRepository['pushTargets']>) {
    return this.notificationRepository.pushTargets(...args)
  }

  leagueNames(...args: Parameters<NotificationRepository['leagueNames']>) {
    return this.notificationRepository.leagueNames(...args)
  }

  saveRoster(...args: Parameters<RosterRepository['saveRoster']>) {
    return this.rosterRepository.saveRoster(...args)
  }

  rostersByUser(...args: Parameters<RosterRepository['rostersByUser']>) {
    return this.rosterRepository.rostersByUser(...args)
  }

  publicRostersByUser(...args: Parameters<RosterRepository['publicRostersByUser']>) {
    return this.rosterRepository.publicRostersByUser(...args)
  }

  rosterSummariesByUser(...args: Parameters<RosterRepository['rosterSummariesByUser']>) {
    return this.rosterRepository.rosterSummariesByUser(...args)
  }

  roster(...args: Parameters<RosterRepository['roster']>) {
    return this.rosterRepository.roster(...args)
  }

  setRosterVisibility(...args: Parameters<RosterRepository['setRosterVisibility']>) {
    return this.rosterRepository.setRosterVisibility(...args)
  }

  collectionByUser(...args: Parameters<RosterRepository['collectionByUser']>) {
    return this.rosterRepository.collectionByUser(...args)
  }

  addToCollection(...args: Parameters<RosterRepository['addToCollection']>) {
    return this.rosterRepository.addToCollection(...args)
  }

  removeFromCollection(...args: Parameters<RosterRepository['removeFromCollection']>) {
    return this.rosterRepository.removeFromCollection(...args)
  }

  favouriteFactionsByUser(...args: Parameters<RosterRepository['favouriteFactionsByUser']>) {
    return this.rosterRepository.favouriteFactionsByUser(...args)
  }

  addFavouriteFaction(...args: Parameters<RosterRepository['addFavouriteFaction']>) {
    return this.rosterRepository.addFavouriteFaction(...args)
  }

  removeFavouriteFaction(...args: Parameters<RosterRepository['removeFavouriteFaction']>) {
    return this.rosterRepository.removeFavouriteFaction(...args)
  }

  favouriteDetachmentsByUser(...args: Parameters<RosterRepository['favouriteDetachmentsByUser']>) {
    return this.rosterRepository.favouriteDetachmentsByUser(...args)
  }

  addFavouriteDetachment(...args: Parameters<RosterRepository['addFavouriteDetachment']>) {
    return this.rosterRepository.addFavouriteDetachment(...args)
  }

  removeFavouriteDetachment(...args: Parameters<RosterRepository['removeFavouriteDetachment']>) {
    return this.rosterRepository.removeFavouriteDetachment(...args)
  }

  deleteRoster(...args: Parameters<RosterRepository['deleteRoster']>) {
    return this.rosterRepository.deleteRoster(...args)
  }

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

  /** Check ownership in the delete statement: the opener is the first seat on side 0, since allies can also occupy that side and old seats can share a timestamp. */
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

  /**
   * Whether the battle the outer query is on seats a practice opponent.
   *
   * Asked in SQL rather than filtered from a page, because a page of a player's
   * practice games filtered afterwards is an empty feed with more battles behind it.
   */
  private seatsPracticeOpponent() {
    const seat = alias(battleUsers, 'practice_seat')
    return exists(
      this.database
        .select({ one: sql`1` })
        .from(seat)
        .innerJoin(practiceOpponents, eq(practiceOpponents.userId, seat.userId))
        .where(eq(seat.battleId, battles.id)),
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

  /** Order public battles by start time, omit practice games, and exclude the viewer’s own games already shown above. */
  async publicBattles(page: { limit: number; before?: BattlesCursor; viewerId?: string | null }) {
    const rows = await this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: battles.createdAt })
      .from(battles)
      .where(
        and(
          not(this.withheldFrom('public')),
          not(this.seatsPracticeOpponent()),
          page.viewerId ? not(this.seatOf(page.viewerId)) : undefined,
          this.startedBefore(page.before),
        ),
      )
      .orderBy(desc(battles.createdAt), desc(battles.id))
      .limit(page.limit + 1)
    return this.hydrateBattles(rows, page.limit)
  }

  /**
   * Battles this player's confirmed friends are in and they are not.
   *
   * A friendship is mutual and settled, so either direction of the row counts.
   * A friend's practice game is left out, as it is from the public list: it is
   * their history, not a game anybody else has a reason to watch.
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
      .where(
        and(
          friendship,
          not(this.seatOf(userId)),
          not(this.withheldFrom('friends')),
          not(this.seatsPracticeOpponent()),
          this.startedBefore(page.before),
        ),
      )
      .orderBy(desc(battles.createdAt), desc(battles.id))
      .limit(page.limit + 1)
    return this.hydrateBattles(rows, page.limit)
  }

  /**
   * Every battle anyone may watch that has moved since `since`, for the standings.
   *
   * Bounded by both a window and a count, because this reads whole logs: a
   * leaderboard is folded from the same histories the battle list folds, and an
   * unbounded one would read every command an instance has ever stored to print
   * ten rows. Which of them are finished is `standings`' to decide, since being
   * finished is a fold rather than a column.
   */
  async watchableBattlesSince(since: number, limit: number) {
    const activity = this.activityTime
    const rows = await this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: activity })
      .from(battles)
      .leftJoin(commands, eq(commands.battleId, battles.id))
      .where(not(this.withheldFrom('public')))
      .groupBy(battles.id)
      .having(sql`coalesce(max(${commands.at}), ${battles.createdAt}) >= ${since}`)
      .orderBy(desc(activity), desc(battles.id))
      .limit(limit)
    return (await this.hydrateBattles(rows)).battles
  }

  /** Bound the profile’s battle candidates and narrow them coarsely in SQL; `maySpectate` makes the final decision from folded seats. */
  async battlesSeatedBy(userId: string, limit: number, viewerId: string | null) {
    const activity = this.activityTime
    const rows = await this.database
      .select({ id: battles.id, token: battles.token, createdAt: battles.createdAt, at: activity })
      .from(battles)
      .innerJoin(battleUsers, eq(battleUsers.battleId, battles.id))
      .leftJoin(commands, eq(commands.battleId, battles.id))
      .where(
        and(
          eq(battleUsers.userId, userId),
          viewerId ? or(this.seatOf(viewerId), not(this.withheldFrom('friends'))) : not(this.withheldFrom('public')),
        ),
      )
      .groupBy(battles.id)
      .orderBy(desc(activity), desc(battles.id))
      .limit(limit)
    return (await this.hydrateBattles(rows)).battles
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

  /** Lock the battle row before reading, validating, and appending a command; return the log read under that lock so the caller can fold the exact result. */
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

export type RepositoryPort = Pick<Repository, keyof Repository>

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
