import { newBattleSeats, type NewBattlePlayers, type CreateBattleInput } from '../core/newBattle'
import { matchingLeagueBattles } from '../shared/leagueBattleOptions'
import { battleSummary, type BattleFaction } from '../shared/battleSummary'
import { offlineIdentifier, offlineContext } from './offlineContext'
import {
  withAuthoritativeAwards,
  hydrateAuthoritativeAwards,
  resolvedMissionForSide,
  setupReferenceError,
  repairPrepReferenceError,
  scoringCapError,
} from '../shared/battleRules'
import { restoreOpaqueBattleKeys, visibleBattleLog } from '../core/offlineBattle'
import type { BattleWorkspace } from '../contracts/battleWorkspace'
import { randomId, randomToken } from 'ras-stack/auth'
import type { AdminBattle } from '../admin'
import {
  battleCapacity,
  type BattleState,
  type Command,
  commandArmy,
  reduceBattle,
  sideDisposition,
  type SubmitResult,
} from '../core/battle'
import { type BattleAudience, battleAudience, maySpectate } from '../core/battleAudience'
import type { PlayerDefaults } from '../core/playerDefaults'
import { type BattleView, battleView } from '../core/battleView'
import { battleReport, type ReportEntry } from '../core/battleReport'
import { battleClock, type BattleClock } from '../core/battleClock'
import { battleLogThroughSeq, battleTimeline, type ReplayPoint } from '../core/battleReplay'
import { compactReplayFrames } from '../core/replayFrames'
import type { OnboardingProgressOperation } from '../core/onboarding'
import {
  filterBattles,
  personalPerformance,
  type RecordFilter,
  recordFacets,
  type SeatPlay,
  seatPlays,
  serviceRecord,
} from '../core/serviceRecord'
import { routeSlug } from '../core/slug'
import { type Standing, type StandingFaction, standings } from '../core/standings'
import { REPLAY_BATCH_SIZE, type BattlesCursor } from '../contracts/battles'
import { gameReferencesFor } from '../shared/gameReferences'
import { type BattleMissionRules, type BattleReadRules, type LoadedRules, type Mission } from './rules'
import { type Notifier, silentNotifier } from './pushNotifier'
import { LeagueService } from './services/leagueService'
import { RosterService } from './services/rosterService'
import { SocialService, sortedFriends } from './services/socialService'
import type { BattleHistory, BattleSeats, RepositoryPort, SpacetimeRepository } from './spacetimeRepository'

/**
 * `mission` is the viewer's, for the screens that are about them. `missions` is every
 * side's, because a ceiling is enforced against the side being scored, either player
 * may record a settlement for the side the turn came back to, and a side nobody signs
 * in to has its cards settled by the table facing it.
 */
type SeatedScreen = {
  kind: 'battle'
  view: BattleView
  clock: BattleClock
  mission: Mission | null
  missions: { side: number; mission: Mission | null }[]
  timeline?: ReplayPoint[]
}
type SpectatorScreen = {
  kind: 'spectator'
  view: BattleView
  clock: BattleClock
  missions: { side: number; mission: Mission | null }[]
  report: ReturnType<typeof battleReport>
  timeline: ReplayPoint[]
}

/**
 * A link resolves to a seated screen, a spectator screen, or nothing.
 *
 * There is no fourth answer offering a seat. A battle names everyone in it at the
 * moment it is created, so no chair is ever standing empty for a link to fill.
 */
type BattleScreen = SeatedScreen | SpectatorScreen | { kind: 'unavailable' }

/** One table of players: everybody, or everybody who has fielded one faction. */
type StandingsTable = { faction: StandingFaction | null; players: number; rows: Standing[] }

/** The overall table, a table per faction played, and how many days back they reach. */
type StandingsAnswer = { days: number; overall: StandingsTable; factions: (StandingsTable & { faction: StandingFaction })[] }

/** Every row of every table, before the leaderboard slices it. Ranks are read off this. */
type StandingsFold = {
  days: number
  overall: { faction: null; rows: Standing[] }
  factions: { faction: StandingFaction; rows: Standing[] }[]
}

/** One player's place in each table they appear in, and the window it covers. */
type PlayerRanking<T> = { faction: T; place: number; of: number; standing: Standing }
type PlayerRankings = {
  days: number
  overall: PlayerRanking<null> | null
  factions: PlayerRanking<StandingFaction>[]
}

const SPECTATOR_ID = ''

/** A page of a home-page feed. Small: every row on it costs a folded log. */
const PUBLIC_BATTLES_PAGE = 10

/** How far back the standings look, and how many battles they will read to do it. */
const DAY_MS = 24 * 60 * 60 * 1000
const STANDINGS_WINDOW_MS = 90 * DAY_MS
const STANDINGS_BATTLE_LIMIT = 500
const STANDINGS_HOLD_MS = 60_000

/** How much of a table is sent. Nobody reads past this, and every faction played costs one. */
const STANDINGS_ROWS = 50

/** How many of a player's battles a profile folds, how many it lists, and its lists. */
const PROFILE_BATTLE_LIMIT = 200
const PROFILE_BATTLE_PAGE = 25

/**
 * What a command answers: what happened to it, and what the battle now is.
 *
 * The screen comes back with the answer because the client's next command is
 * conditional on this one having landed. Left to learn that from the refetch a
 * round trip later, a page acts on a view it has already changed — sending a seq
 * from before its own command, or naming the wrong command to undo.
 */
type SubmitAnswer = { result: SubmitResult; screen: SeatedScreen }

export class PraetoriumService {
  private readonly leagueService: LeagueService
  private readonly rosterService: RosterService
  private readonly socialService: SocialService

  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly randomIndex: (limit: number) => number,
    private readonly notifier: Notifier = silentNotifier,
    private readonly standingsRevision?: () => Promise<string>,
  ) {
    this.leagueService = new LeagueService(repository, clock, notifier)
    this.rosterService = new RosterService(repository, clock)
    this.socialService = new SocialService(repository, clock, notifier)
  }

  onboardingProgress(userId: string) {
    return this.repository.onboardingProgress(userId)
  }

  updateOnboardingProgress(userId: string, operation: OnboardingProgressOperation) {
    return this.repository.updateOnboardingProgress(userId, operation)
  }

  createLeague(...args: Parameters<LeagueService['createLeague']>) {
    return this.leagueService.createLeague(...args)
  }

  createLeagueEvent(...args: Parameters<LeagueService['createLeagueEvent']>) {
    return this.leagueService.createLeagueEvent(...args)
  }

  updateLeague(...args: Parameters<LeagueService['updateLeague']>) {
    return this.leagueService.updateLeague(...args)
  }

  deleteLeague(...args: Parameters<LeagueService['deleteLeague']>) {
    return this.leagueService.deleteLeague(...args)
  }

  leagues(...args: Parameters<LeagueService['leagues']>) {
    return this.leagueService.leagues(...args)
  }

  outdatedLeagueEntriesForRoster(...args: Parameters<LeagueService['outdatedLeagueEntriesForRoster']>) {
    return this.leagueService.outdatedLeagueEntriesForRoster(...args)
  }

  league(...args: Parameters<LeagueService['league']>) {
    return this.leagueService.league(...args)
  }

  joinLeague(...args: Parameters<LeagueService['joinLeague']>) {
    return this.leagueService.joinLeague(...args)
  }

  admitLeagueEntries(...args: Parameters<LeagueService['admitLeagueEntries']>) {
    return this.leagueService.admitLeagueEntries(...args)
  }

  moderateLeagueEntry(...args: Parameters<LeagueService['moderateLeagueEntry']>) {
    return this.leagueService.moderateLeagueEntry(...args)
  }

  assignLeagueRosterRequirement(...args: Parameters<LeagueService['assignLeagueRosterRequirement']>) {
    return this.leagueService.assignLeagueRosterRequirement(...args)
  }

  assignLeagueTeam(...args: Parameters<LeagueService['assignLeagueTeam']>) {
    return this.leagueService.assignLeagueTeam(...args)
  }

  ownRoster(...args: Parameters<LeagueService['ownRoster']>) {
    return this.leagueService.ownRoster(...args)
  }

  submitLeagueRoster(...args: Parameters<LeagueService['submitLeagueRoster']>) {
    return this.leagueService.submitLeagueRoster(...args)
  }

  revealLeague(...args: Parameters<LeagueService['revealLeague']>) {
    return this.leagueService.revealLeague(...args)
  }

  unsealLeagueRoster(...args: Parameters<LeagueService['unsealLeagueRoster']>) {
    return this.leagueService.unsealLeagueRoster(...args)
  }

  leagueRoster(...args: Parameters<LeagueService['leagueRoster']>) {
    return this.leagueService.leagueRoster(...args)
  }

  addLeagueEntrants(...args: Parameters<LeagueService['addLeagueEntrants']>) {
    return this.leagueService.addLeagueEntrants(...args)
  }

  createLeagueBattle(...args: Parameters<LeagueService['createLeagueBattle']>) {
    return this.leagueService.createLeagueBattle(...args)
  }

  saveRoster(...args: Parameters<RosterService['saveRoster']>) {
    return this.rosterService.saveRoster(...args)
  }

  savedRosters(...args: Parameters<RosterService['savedRosters']>) {
    return this.rosterService.savedRosters(...args)
  }

  savedRostersByIds(...args: Parameters<RosterService['savedRostersByIds']>) {
    return this.rosterService.savedRostersByIds(...args)
  }

  rosterGroup(...args: Parameters<RosterService['rosterGroup']>) {
    return this.rosterService.rosterGroup(...args)
  }

  savedRosterSummaries(...args: Parameters<RosterService['savedRosterSummaries']>) {
    return this.rosterService.savedRosterSummaries(...args)
  }

  homeRosters(...args: Parameters<RosterService['homeRosters']>) {
    return this.rosterService.homeRosters(...args)
  }

  publicRosters(...args: Parameters<RosterService['publicRosters']>) {
    return this.rosterService.publicRosters(...args)
  }

  rosterAccess(...args: Parameters<RosterService['rosterAccess']>) {
    return this.rosterService.rosterAccess(...args)
  }

  sharedRoster(...args: Parameters<RosterService['sharedRoster']>) {
    return this.rosterService.sharedRoster(...args)
  }

  setRosterVisibility(...args: Parameters<RosterService['setRosterVisibility']>) {
    return this.rosterService.setRosterVisibility(...args)
  }

  deleteRoster(...args: Parameters<RosterService['deleteRoster']>) {
    return this.rosterService.deleteRoster(...args)
  }

  collection(...args: Parameters<RosterService['collection']>) {
    return this.rosterService.collection(...args)
  }

  setOwned(...args: Parameters<RosterService['setOwned']>) {
    return this.rosterService.setOwned(...args)
  }

  favouriteFactions(...args: Parameters<RosterService['favouriteFactions']>) {
    return this.rosterService.favouriteFactions(...args)
  }

  setFavouriteFaction(...args: Parameters<RosterService['setFavouriteFaction']>) {
    return this.rosterService.setFavouriteFaction(...args)
  }

  favouriteDetachments(...args: Parameters<RosterService['favouriteDetachments']>) {
    return this.rosterService.favouriteDetachments(...args)
  }

  setFavouriteDetachment(...args: Parameters<RosterService['setFavouriteDetachment']>) {
    return this.rosterService.setFavouriteDetachment(...args)
  }

  opponents(...args: Parameters<SocialService['opponents']>) {
    return this.socialService.opponents(...args)
  }

  friendships(...args: Parameters<SocialService['friendships']>) {
    return this.socialService.friendships(...args)
  }

  searchPlayers(...args: Parameters<SocialService['searchPlayers']>) {
    return this.socialService.searchPlayers(...args)
  }

  requestFriend(...args: Parameters<SocialService['requestFriend']>) {
    return this.socialService.requestFriend(...args)
  }

  acceptFriend(...args: Parameters<SocialService['acceptFriend']>) {
    return this.socialService.acceptFriend(...args)
  }

  rejectFriend(...args: Parameters<SocialService['rejectFriend']>) {
    return this.socialService.rejectFriend(...args)
  }

  removeFriend(...args: Parameters<SocialService['removeFriend']>) {
    return this.socialService.removeFriend(...args)
  }

  activeFriendInvite(...args: Parameters<SocialService['activeFriendInvite']>) {
    return this.socialService.activeFriendInvite(...args)
  }

  friendInvite(...args: Parameters<SocialService['friendInvite']>) {
    return this.socialService.friendInvite(...args)
  }

  createFriendInvite(...args: Parameters<SocialService['createFriendInvite']>) {
    return this.socialService.createFriendInvite(...args)
  }

  cancelFriendInvite(...args: Parameters<SocialService['cancelFriendInvite']>) {
    return this.socialService.cancelFriendInvite(...args)
  }

  acceptFriendInvite(...args: Parameters<SocialService['acceptFriendInvite']>) {
    return this.socialService.acceptFriendInvite(...args)
  }

  /** The last standings folded, and when they stop being offered. See `standings`. */
  private standingsHeld: { key: string; until: number; fold: StandingsFold } | null = null
  private standingsPending: { key: string; promise: Promise<StandingsFold> } | null = null

  adminUsers(input: Parameters<SpacetimeRepository['adminUsers']>[0]) {
    return this.repository.adminUsers(input)
  }

  userById(id: string) {
    return this.repository.userById(id)
  }

  /**
   * A new league opens at the default duel size; its rules are the event's to change.
   *
   * Registration is what creation is for, so the shape of the games is asked once the
   * league exists and only until an entrant seals a list against it.
   */
  unlinkAccount(userId: string, providerId: string, availableProviders: readonly string[]) {
    return this.repository.unlinkAccount(userId, providerId, availableProviders)
  }

  /**
   * A user's battles with their current state folded from each log.
   *
   * The logs arrive with the seats, so the cost of this page does not grow by a
   * round trip for every battle the player has ever opened.
   */
  async battles(
    userId: string,
    rules?: BattleMissionRules | null,
    page?: { limit: number; before?: BattlesCursor; withUserId?: string },
    factions?: readonly BattleFaction[],
  ) {
    const { battles: histories, nextCursor } = await this.repository.battlesByUser(userId, page)
    return { battles: this.battleSummaries(histories, userId, rules, factions), nextCursor }
  }

  /**
   * The battles anyone may watch, for the home page.
   *
   * Folded with no viewer, the same as a league event's list: a reader with no
   * seat is told what a spectator of any one of these would be told, and nothing
   * in a summary is hidden from a spectator anyway.
   */
  async publicBattles(
    viewerId: string | null,
    rules?: BattleMissionRules | null,
    page?: { limit: number; before?: BattlesCursor },
    factions?: readonly BattleFaction[],
  ) {
    const { battles: histories, nextCursor } = await this.repository.publicBattles({
      limit: page?.limit ?? PUBLIC_BATTLES_PAGE,
      before: page?.before,
      viewerId,
    })
    return { battles: this.battleSummaries(histories, viewerId, rules, factions), nextCursor }
  }

  /** The battles this player's friends are in and they are not. */
  async friendBattles(
    userId: string,
    rules?: BattleMissionRules | null,
    page?: { limit: number; before?: BattlesCursor },
    factions?: readonly BattleFaction[],
  ) {
    const { battles: histories, nextCursor } = await this.repository.battlesByFriends(userId, {
      limit: page?.limit ?? PUBLIC_BATTLES_PAGE,
      before: page?.before,
    })
    return { battles: this.battleSummaries(histories, userId, rules, factions), nextCursor }
  }

  /** The leaderboard folds one bounded set of watchable battles for all faction filters and caches the derived result for one minute. */
  private async standingsFold(factions: readonly BattleFaction[]) {
    const now = this.clock()
    const revision = await this.standingsRevision?.()
    const key = JSON.stringify([revision, factions.map(({ id, slug, displayName }) => [id, slug, displayName])])
    if (this.standingsHeld?.key === key && this.standingsHeld.until > now) return this.standingsHeld.fold
    if (this.standingsPending?.key === key) return this.standingsPending.promise
    const pending = (async () => {
      const [histories, practice] = await Promise.all([
        this.repository.watchableBattlesSince(now - STANDINGS_WINDOW_MS, STANDINGS_BATTLE_LIMIT),
        this.repository.practiceOpponents(),
      ])
      const summaries = this.battleSummaries(histories, null, null, factions)
      const tables = standings(summaries, { exclude: practice.map((opponent) => opponent.id) })
      // The battle limit can bite before the window does, so the fold reports the days
      // it actually reached back rather than the ninety it asked for: a page claiming a
      // window nothing was counted from is a number no reader can check.
      const oldest =
        summaries.length < STANDINGS_BATTLE_LIMIT ? now - STANDINGS_WINDOW_MS : Math.min(...summaries.map((battle) => battle.lastActivity))
      const fold = {
        days: Math.max(1, Math.round((now - oldest) / DAY_MS)),
        overall: { faction: null, rows: tables.overall },
        factions: tables.factions,
      }
      this.standingsHeld = { key, until: this.clock() + STANDINGS_HOLD_MS, fold }
      return fold
    })()
    this.standingsPending = { key, promise: pending }
    try {
      return await pending
    } finally {
      if (this.standingsPending?.promise === pending) this.standingsPending = null
    }
  }

  async standings(factions: readonly BattleFaction[] = []): Promise<StandingsAnswer> {
    const { days, overall, factions: played } = await this.standingsFold(factions)
    const page = <T extends StandingFaction | null>(table: { faction: T; rows: Standing[] }) => ({
      faction: table.faction,
      players: table.rows.length,
      rows: table.rows.slice(0, STANDINGS_ROWS),
    })
    return { days, overall: page(overall), factions: played.map(page) }
  }

  /**
   * Where one player sits in each table they appear in.
   *
   * The same held fold the leaderboard pages, so a rank on a profile is the row
   * that page would show and cannot drift from it. A player outside the rows the
   * leaderboard sends still has a rank here, because the fold is not sliced until
   * the leaderboard asks.
   */
  async playerRankings(userId: string, factions: readonly BattleFaction[] = []): Promise<PlayerRankings> {
    const fold = await this.standingsFold(factions)
    const rank = <T extends StandingFaction | null>({ faction, rows }: { faction: T; rows: Standing[] }) => {
      const at = rows.findIndex((row) => row.id === userId)
      return at === -1 ? [] : [{ faction, place: at + 1, of: rows.length, standing: rows[at] as Standing }]
    }
    return {
      days: fold.days,
      overall: rank(fold.overall)[0] ?? null,
      // Ordered by how much of this player's own record each army accounts for. The
      // leaderboard's order is how much everybody has played it, which on a profile
      // puts the army they brought once above the one they always bring.
      factions: fold.factions
        .flatMap(rank)
        .toSorted((one, other) => other.standing.battles - one.standing.battles || one.place - other.place),
    }
  }

  /** Fold the record over the full bounded watchable set, while paginating only the battle list; practice games stay in history but not the record. */
  async playerProfile(
    userId: string,
    viewerId: string | null,
    filter: RecordFilter = {},
    rules?: BattleReadRules | null,
    factions: readonly BattleFaction[] = [],
  ) {
    const [seated, practice] = await Promise.all([
      this.repository.battlesSeatedBy(userId, PROFILE_BATTLE_LIMIT, viewerId),
      this.repository.practiceOpponents(),
    ])
    const histories = await this.watchable(seated, viewerId)
    const practised = new Set(practice.map((opponent) => opponent.id))
    const summaries = this.recordBattles(
      histories.filter((history) => !history.players.some((player) => practised.has(player.id))),
      viewerId,
      rules,
      factions,
    )
    // The facets are what the player has played, not what is left after narrowing —
    // a control that empties itself as soon as it is used cannot be used twice.
    const facets = recordFacets(summaries, userId)
    const shown = filterBattles(summaries, userId, filter)
    return {
      record: serviceRecord(summaries, userId, filter),
      performance: viewerId === userId ? personalPerformance(summaries, userId, filter) : null,
      facets,
      // What each side did is the record's to count, not the battle list's to carry.
      battles: shown.slice(0, PROFILE_BATTLE_PAGE).map(({ plays: _plays, ...battle }) => battle),
      played: shown.length,
    }
  }

  /** How widely this player's battles may be seen, and their own answer to it. */
  battleAudience(userId: string) {
    return this.repository.battleAudience(userId)
  }

  setBattleAudience(userId: string, audience: BattleAudience) {
    return this.repository.setBattleAudience(userId, audience, this.clock())
  }

  pushEnabled(userId: string) {
    return this.repository.pushEnabled(userId)
  }

  setPushEnabled(userId: string, enabled: boolean) {
    return this.repository.setPushEnabled(userId, enabled, this.clock())
  }

  /** What this player's new rosters and battles start with. */
  playerDefaults(userId: string) {
    return this.repository.playerDefaults(userId)
  }

  setPlayerDefaults(userId: string, defaults: PlayerDefaults) {
    return this.repository.setPlayerDefaults(userId, defaults, this.clock())
  }

  registerPushDevice(userId: string, device: { token: string; platform: 'ios' | 'android' }) {
    return this.repository.registerPushToken({ userId, ...device, now: this.clock() })
  }

  unregisterPushDevice(userId: string, token: string) {
    return this.repository.unregisterPushToken(userId, token)
  }

  /** Batch audience and friendship reads, then use `battleAudience` and `maySpectate` for each final visibility decision. */
  private async watchable(histories: readonly BattleHistory[], viewerId: string | null) {
    const seats = [...new Set(histories.flatMap((history) => history.players.map((player) => player.id)))]
    const audiences = await this.repository.battleAudiences(seats)
    const folded = histories.map((history) => ({
      history,
      audience: battleAudience(history.players.map((player) => audiences.get(player.id))),
    }))
    const turnsOnAFriend = Boolean(viewerId) && folded.some((one) => one.audience === 'friends')
    const friends = viewerId && turnsOnAFriend ? sortedFriends(await this.repository.relationships(viewerId), viewerId).friends : []
    return folded
      .filter(({ history, audience }) => {
        if (viewerId && history.players.some((player) => player.id === viewerId)) return true
        const friend = friends.some((known) => history.players.some((player) => player.id === known.id))
        return maySpectate(audience, { signedIn: Boolean(viewerId), friend })
      })
      .map(({ history }) => history)
  }

  /** Whether a viewer may read this one battle. One question, so one battle's worth of `watchable`. */
  private async mayWatch(history: BattleHistory, viewerId: string | null) {
    return (await this.watchable([history], viewerId)).length > 0
  }

  async leagueBattles(
    leagueToken: string,
    eventToken: string,
    page: { limit: number; before?: BattlesCursor },
    rules?: BattleMissionRules | null,
    factions?: readonly BattleFaction[],
  ) {
    const { battles: histories, nextCursor } = await this.repository.battlesByLeagueEvent(leagueToken, eventToken, page)
    return { battles: this.battleSummaries(histories, null, rules, factions), nextCursor }
  }

  private battleSummaries(
    histories: readonly BattleHistory[],
    viewerId: string | null,
    rules?: BattleMissionRules | null,
    factions: readonly BattleFaction[] = [],
  ) {
    const factionsById = new Map(factions.map((faction) => [faction.id, faction]))
    return histories.map((history) => battleSummary(history, foldHistory(history), viewerId, rules, factionsById))
  }

  /**
   * The battle list's summaries with what each side did with its resources, for a
   * record. Each log is folded once for both, so the record costs no second pass.
   */
  private recordBattles(
    histories: readonly BattleHistory[],
    viewerId: string | null,
    rules: BattleReadRules | null | undefined,
    factions: readonly BattleFaction[],
  ) {
    const factionsById = new Map(factions.map((faction) => [faction.id, faction]))
    return histories.map((history) => {
      const state = foldHistory(history)
      return {
        ...battleSummary(history, state, viewerId, rules, factionsById),
        plays: referencedPlays(state, seatPlays(state, viewerId), rules, factionsById),
      }
    })
  }

  /**
   * Someone's name and picture.
   *
   * Open to anybody, including a reader with no account. A name is already on
   * every battle a player allows to be watched and on every row of the
   * leaderboard, so gating the page that shows the same name behind a friendship
   * only produced links that led nowhere. What a player keeps to themselves is
   * their battles, which `battleAudience` governs; who they are is not a secret
   * the product was ever keeping.
   */
  async userProfile(userId: string) {
    const [profile, sponsorship, admin] = await Promise.all([
      this.repository.profileByUserId(userId),
      this.repository.githubSponsorship(userId),
      this.repository.isAdmin(userId),
    ])
    // A private sponsorship stays private: only its owner's settings say it.
    return profile ? { ...profile, supporter: sponsorship === 'public', admin } : null
  }

  githubSponsorship(userId: string) {
    return this.repository.githubSponsorship(userId)
  }

  async createBattle(userId: string, input?: string | CreateBattleInput) {
    const settings = typeof input === 'object' ? { ...input, limit: input.limit ?? null } : { limit: null, missionPackId: null }
    const { allyIds, opponentIds, invited } = newBattleSeats(input)
    // One query for everyone named rather than one apiece, and both reads at once:
    // who exists and who may be invited are independent questions.
    const [known, invitable] = await Promise.all([this.repository.namesByIds(invited), this.opponents(userId)])
    if (new Set(invited).size !== invited.length || invited.some((id) => id === userId || !known.has(id))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    const allowed = new Map(invitable.map((opponent) => [opponent.id, opponent]))
    if (invited.some((id) => !allowed.has(id)))
      throw new Response('battle players must be your friends or a practice opponent', { status: 403 })
    // How many chairs a battle has is `battleCapacity`'s to say, here as everywhere.
    if (invited.length >= battleCapacity({ teamBattle: true, playerCount: 4 }))
      throw new Response('a battle seats four players at most', { status: 400 })
    // Every battle names its table. There is no opening a game and waiting to see
    // who turns up, so a battle without an opponent is not a battle yet.
    if (!opponentIds.length) throw new Response('choose an opponent', { status: 400 })
    if (invited.length && (typeof input !== 'object' || !input.casual)) {
      const leagueMatches = await this.leagueBattleOptions(userId, input)
      if (leagueMatches.length) {
        throw new Response('start this matchup from its league page, or confirm a casual battle', { status: 409 })
      }
    }
    const practice = invited.some((id) => allowed.get(id)?.automated)
    const token = offlineIdentifier('battleToken', randomToken)
    const id = offlineIdentifier('battleId', randomId)
    await this.repository.createBattle({
      id,
      token,
      userId,
      allyIds,
      opponentIds,
      initialCommand: {
        kind: 'configure-battle',
        limit: settings.limit,
        missionPackId: settings.missionPackId,
        terrainLayoutId: null,
        twistId: null,
        teamBattle: invited.length >= 2,
        playerCount: (invited.length + 1) as 2 | 3 | 4,
        clockLimitMinutes: null,
      },
      now: offlineContext.getStore()?.createdAt ?? this.clock(),
    })
    this.notifier.notify([{ kind: 'battle-created', actorId: userId, recipientIds: invited, battleToken: token, league: false }])
    return { token, practice }
  }

  async leagueBattleOptions(userId: string, input?: string | NewBattlePlayers) {
    const { opponentIds, invited } = newBattleSeats(input)
    const participantIds = [userId, ...invited]
    if (!opponentIds.length || new Set(participantIds).size !== participantIds.length) return []
    const candidates = await this.repository.leagueBattleCandidates(userId, participantIds)
    return matchingLeagueBattles(candidates, userId, input)
  }

  /** Who sat at each of a player's latest battles and how far it got. The battles themselves still open through `maySpectate`. */
  async adminPlayerBattles(userId: string): Promise<AdminBattle[]> {
    const { battles } = await this.repository.battlesByUser(userId, { limit: 5 })
    return battles.map(adminBattleSummary)
  }

  /** False when there was no such battle to delete. */
  async deleteBattleAsAdmin(token: string) {
    const history = await this.repository.battleHistoryByToken(token)
    return Boolean(history && (await this.repository.deleteBattleForOperator(history.battle.id)))
  }

  async deleteBattle(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    if (!(await this.repository.deleteBattle(seats.battle.id, userId)))
      throw new Response('only the battle creator can delete it', { status: 403 })
  }

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  async screen(token: string, userId: string | null, rules?: BattleReadRules | null): Promise<BattleScreen> {
    const history = await this.mustFind(token)
    return this.visibleScreen(history, userId, rules)
  }

  private async visibleScreen(history: BattleHistory, userId: string | null, rules?: BattleReadRules | null): Promise<BattleScreen> {
    const viewerId = userId && this.seated(history, userId) ? userId : SPECTATOR_ID
    const screen = this.battleScreen(history, viewerId, rules)
    // A seated player sees the timeline only once the battle is over; until then they are playing it.
    if (viewerId !== SPECTATOR_ID)
      return screen.view.status === 'finished'
        ? { ...screen, timeline: this.replayTimeline(history, this.viewerReport(history, viewerId, rules)) }
        : screen
    // Everyone else either watches or is told no. Nobody arrives here to sit down:
    // the seats were filled when the battle was created.
    if (!screen.view.leagueToken && !(await this.mayWatch(history, userId))) return { kind: 'unavailable' }
    const report = this.viewerReport(history, SPECTATOR_ID, rules)
    return {
      kind: 'spectator',
      view: screen.view,
      clock: screen.clock,
      missions: screen.missions,
      report,
      timeline: this.replayTimeline(history, report),
    }
  }

  private viewerReport(history: BattleHistory, viewerId: string, rules?: BattleReadRules | null) {
    return battleReport(
      history.players,
      history.log,
      history.players.map((player) => player.id),
      viewerId,
      history.players.map((player) => player.side),
      rules,
    )
  }

  private replayTimeline(history: BattleHistory, report: readonly ReportEntry[]): ReplayPoint[] {
    const playerIds = history.players.map((player) => player.id)
    const sides = history.players.map((player) => player.side)
    const labels = new Map(report.map((entry) => [entry.seq, entry.text]))
    const kinds = new Map(history.log.map((entry) => [entry.seq, entry.command.kind]))
    return battleTimeline(
      playerIds,
      history.log,
      sides,
      history.players.filter((player) => player.automated).map((player) => player.id),
    ).map((point) => ({
      ...point,
      text: labels.get(point.seq) ?? (kinds.get(point.seq) === 'undo' ? 'Undoes the previous action' : 'Action later undone'),
    }))
  }

  async replayAt(token: string, userId: string | null, seq: number, rules?: BattleReadRules | null) {
    const result = await this.replayBatch(token, userId, [seq], rules)
    return result.kind === 'unavailable' ? result : result.first
  }

  async replayBatch(token: string, userId: string | null, seqs: readonly number[], rules?: BattleReadRules | null) {
    const history = await this.mustFind(token)
    const current = await this.visibleScreen(history, userId, rules)
    if (current.kind === 'unavailable') return current
    const available = new Set(history.log.map((entry) => entry.seq))
    if (seqs.length < 1 || seqs.length > REPLAY_BATCH_SIZE || seqs.some((seq) => !Number.isInteger(seq) || !available.has(seq))) {
      throw new Response('no such battle event', { status: 404 })
    }
    const playerIds = history.players.map((player) => player.id)
    const sides = history.players.map((player) => player.side)
    const viewerId = current.kind === 'battle' ? userId! : SPECTATOR_ID
    return {
      kind: 'replay-batch' as const,
      ...compactReplayFrames(
        seqs.map((seq) => {
          const log = battleLogThroughSeq(history.log, seq)
          const frame = this.battleScreen({ ...history, log }, viewerId, rules)
          return {
            kind: 'replay' as const,
            view: frame.view,
            // A past moment is read back, so nothing in it keeps counting.
            clock: { ...frame.clock, running: null },
            missions: frame.missions,
            report: battleReport(history.players, log, playerIds, viewerId, sides, rules),
          }
        }),
      ),
    }
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  async report(token: string, userId: string, rules?: BattleReadRules | null) {
    const history = await this.mustFind(token)
    if (!this.seated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    return this.viewerReport(history, userId, rules)
  }

  async battleWorkspace(
    token: string,
    userId: string,
    rules?: BattleReadRules | null,
  ): Promise<{ workspace: BattleWorkspace; screen: SeatedScreen }> {
    const history = await this.mustFind(token)
    if (!this.seated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    if (history.log.length > 10_000) throw new Response('this battle exceeds the offline history limit', { status: 409 })
    return {
      workspace: {
        ...history,
        log: visibleBattleLog(history.players, history.log, userId),
        serverSeq: history.log.at(-1)?.seq ?? 0,
        serverNow: this.clock(),
      },
      screen: this.battleScreen(history, userId, rules),
    }
  }

  syncReceipt(...args: Parameters<RepositoryPort['syncReceipt']>) {
    return this.repository.syncReceipt(...args)
  }

  syncRoster(...args: Parameters<RepositoryPort['syncRoster']>) {
    return this.repository.syncRoster(...args)
  }

  async hasBattleOperation(token: string, userId: string, operationId: string) {
    const history = await this.mustFind(token)
    if (!this.seated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    return history.log.some((entry) => entry.operationId === operationId && entry.by === userId)
  }

  async submit(
    token: string,
    userId: string,
    expectedSeq: number,
    command: Command,
    rules?: LoadedRules | null,
    sync?: { operationId: string; fingerprint: string; recordedAt: number },
  ): Promise<SubmitAnswer> {
    const seats = await this.mustSeat(token, userId)
    if (sync) command = restoreOpaqueBattleKeys(seats.players, (await this.mustFind(token)).log, command)
    if (command.kind === 'lock-league-rosters') throw new Response('league roster locks are created by the server', { status: 403 })
    // The log comes back with the answer, so a refusal and a lost race both report
    // the state that refused them rather than the one the caller was holding —
    // and without a second read of a history the append had already in hand.
    const { result, log } = await this.repository.submit(
      { battleId: seats.battle.id, userId, expectedSeq, command, now: this.clock(), ...sync },
      (state) => {
        if (command.kind === 'begin-battle') return rules ? setupReferenceError(state, rules) : null
        if (command.kind === 'set-prep' && state.status === 'playing') {
          return rules ? repairPrepReferenceError(state, userId, command, rules) : null
        }
        if (command.kind === 'score' || command.kind === 'score-secondary' || command.kind === 'score-settlement')
          return rules ? scoringCapError(state, userId, command, rules) : null
        return null
      },
      (state, submitted) => {
        if (rules) hydrateAuthoritativeAwards(state, rules)
        if (rules && submitted.kind === 'set-prep') return withAuthoritativeAwards(submitted, rules)
        if (rules && submitted.kind === 'attach-roster' && submitted.prep) {
          return { ...submitted, prep: withAuthoritativeAwards(submitted.prep, rules) }
        }
        if (sync) return submitted
        if (submitted.kind === 'use-new-orders') {
          const player = commandArmy(state, userId, submitted)
          const remaining = (player?.secondaryDeck ?? []).filter(
            (candidate) => !player?.secondaries.some((secondary) => secondary.key === candidate.key),
          )
          return remaining.length ? { ...submitted, secondary: remaining[this.randomIndex(remaining.length)]! } : submitted
        }
        if (submitted.kind !== 'draw-secondary' && submitted.kind !== 'draw-secondaries') return submitted
        if (submitted.kind === 'draw-secondaries' && submitted.selected) return submitted
        // Whose deck this is comes from the domain, so the cards cannot be taken off
        // one side's deck and recorded against another's.
        const player = commandArmy(state, userId, submitted)
        const remaining = (player?.secondaryDeck ?? []).filter(
          (candidate) => !player?.secondaries.some((secondary) => secondary.key === candidate.key),
        )
        if (!remaining.length) return submitted
        if (submitted.kind === 'draw-secondary') return { ...submitted, secondary: remaining[this.randomIndex(remaining.length)]! }
        const available = [...remaining]
        const secondaries = submitted.secondaries
          .slice(0, available.length)
          .map(() => available.splice(this.randomIndex(available.length), 1)[0]!)
          .filter(Boolean)
        return { ...submitted, secondaries }
      },
    )
    return { result, screen: this.battleScreen({ ...seats, log }, userId, rules) }
  }

  /** Opening a battle stream is an authorization decision. */
  async userBattleId(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    return seats.battle.id
  }

  /** The only place a visibility-filtered battle view is built. */
  private battleScreen(history: BattleHistory, userId: string, rules?: BattleReadRules | null): SeatedScreen {
    const fold = [
      history.players.map((player) => player.id),
      history.log,
      history.players.map((player) => player.side),
      history.players.filter((player) => player.automated).map((player) => player.id),
    ] as const
    const state = reduceBattle(...fold)
    if (rules) hydrateAuthoritativeAwards(state, rules)
    const view = battleView(history.battle, history.players, state, userId, this.clock())
    const missionForSide = (side: number) => (rules ? resolvedMissionForSide(state, rules, side) : null)
    const viewerSide = view.players.find((player) => player.id === userId)?.side
    return {
      kind: 'battle',
      view,
      clock: battleClock(...fold),
      mission: viewerSide === undefined ? null : missionForSide(viewerSide),
      missions: [...new Set(view.players.map((player) => player.side))].map((side) => ({ side, mission: missionForSide(side) })),
    }
  }

  private seated(seats: BattleSeats, userId: string) {
    return seats.players.some((player) => player.id === userId)
  }

  /** Seats alone, for the callers that do not need the history. */
  private async mustSeat(token: string, userId: string) {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    if (!this.seated(seats, userId)) throw new Response('you are not in this battle', { status: 403 })
    return seats
  }

  private async mustFind(token: string): Promise<BattleHistory> {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history) throw new Response('no such battle', { status: 404 })
    return history
  }
}

function adminBattleSummary(history: BattleHistory): AdminBattle {
  const state = foldHistory(history)
  return {
    token: history.battle.token,
    createdAt: history.battle.createdAt,
    lastActivity: history.log.at(-1)?.at ?? history.battle.createdAt,
    status: state.status,
    round: state.round,
    players: history.players.map(({ id, name, side }) => ({ id, name, side })),
  }
}

function foldHistory({ players, log }: BattleHistory) {
  return reduceBattle(
    players.map((player) => player.id),
    log,
    players.map((player) => player.side),
    players.filter((player) => player.automated).map((player) => player.id),
  )
}

/**
 * What each side played, joined to the reference page it is printed on.
 *
 * A link is attached only where the page answers: a detachment stratagem whose
 * detachment the fielding army's catalogue faction lists, a secondary the rules
 * carry in a pack they carry, and a primary whose matchup page resolves. The
 * primary is the one the battle screen shows, resolved from both sides'
 * dispositions, falling back to what `set-prep` recorded only where that fails.
 */
function referencedPlays(
  state: BattleState,
  plays: SeatPlay[],
  rules: BattleReadRules | null | undefined,
  factionsById: ReadonlyMap<string, BattleFaction>,
): SeatPlay[] {
  const packId = state.settings.missionPackId
  const packs = rules ? gameReferencesFor(rules).packs : []
  const pack = packs.find((candidate) => candidate.id === packId)
  const cards = new Set(pack ? rules?.secondaries.map((card) => card.key) : [])
  return plays.map((play, seat) => {
    const player = state.players[seat]!
    const allies = state.players.filter((candidate) => candidate.side === player.side)
    const printedBy = (detachment: string | undefined) => {
      if (!detachment) return undefined
      const faction = allies
        .map((ally) => factionsById.get(ally.roster?.built?.catalogueId ?? ''))
        .find((candidate) => candidate?.detachments?.some((listed) => listed.name === detachment))
      const route = faction?.detachments?.find((listed) => listed.name === detachment)?.referenceRoute
      return faction ? { catalogueId: route?.catalogueId ?? faction.slug, detachmentId: route?.slug ?? routeSlug(detachment) } : undefined
    }
    const opposingSide = state.players.find((candidate) => candidate.side !== player.side)?.side
    const you = sideDisposition(state, player.side)
    const opponent = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
    const mission = play.primary && rules && state.status !== 'setup' ? resolvedMissionForSide(state, rules, player.side) : null
    const matchup = pack?.missions.some(
      (candidate) => candidate.id === mission?.id && candidate.matchups.some((pair) => pair[0]?.id === you && pair[1]?.id === opponent),
    )
    return {
      ...play,
      stratagems: play.stratagems.map((use) => {
        const reference = printedBy(use.detachment)
        return reference ? { ...use, reference } : use
      }),
      cards: play.cards.map((card) => (packId && cards.has(card.key) ? { ...card, reference: { packId } } : card)),
      primary: mission
        ? {
            key: mission.id,
            name: mission.name,
            ...(matchup && packId && you && opponent ? { reference: { packId, you, opponent } } : {}),
          }
        : play.primary,
    }
  })
}

/** The legacy column held one id; new rows hold the ordered 11e purchase list. */
/**
 * The format rules a saved row says it has waived.
 *
 * Parsed rather than trusted: a rule id this build does not know would be a
 * restriction the roster believes is off while every check still enforces it, so an
 * unrecognised name is dropped and the rule goes on being played.
 */
