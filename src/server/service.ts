import { createHash } from 'node:crypto'
import { constantTimeEqual } from 'better-auth/crypto'
import { byId } from '../core/collections'
import { isGuestSeat, newBattleSeats, type NewBattlePlayers, type CreateBattleInput } from '../core/newBattle'
import { guestSessionCurrent } from '../core/guestSession'
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
import { battleFoldArgs, restoreOpaqueBattleKeys, visibleBattleLog } from '../core/offlineBattle'
import type { BattleWorkspace } from '../contracts/battleWorkspace'
import { randomId, randomToken } from 'ras-stack/auth'
import type { AdminBattle } from '../admin'
import {
  battleCapacity,
  type BattleEndReason,
  type BattleState,
  type Command,
  commandArmy,
  reduceBattle,
  sideDisposition,
  type SubmitResult,
} from '../core/battle'
import { playedArmies } from '../core/playedArmies'
import type { PlayerDefaults } from '../core/playerDefaults'
import type { RecentMatchup } from '../core/recentMatchups'
import { ABILITY_REMINDERS_FULL, type AbilityReminder } from '../core/reminders'
import { simulatorPairing } from '../contracts/simulatorState'
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
import { battleOutcome, sideScore, type Standing, type StandingBattle, type StandingFaction, standings } from '../core/standings'
import { opposingSide, refuse } from '../core/battlePrimitives'
import { swissPairings, swissStandings, type SwissMatch } from '../core/swiss'
import { LEAGUE_RESULTS_BATTLE_LIMIT, leagueResults } from '../core/leagueResults'
import { REPLAY_BATCH_SIZE, type BattlesCursor } from '../contracts/battles'
import { gameReferencesFor } from '../shared/gameReferences'
import { archivedArmies } from '../core/archivedArmies'
import { currentCatalogueFamilyId } from '../core/retiredCatalogueIds'
import { type BattleMissionRules, type BattleReadRules, type LoadedRules, type Mission } from './rules'
import { type Notifier, silentNotifier } from './pushNotifier'
import { LeagueService } from './services/leagueService'
import { ClubService } from './services/clubService'
import { RosterService } from './services/rosterService'
import { SocialService } from './services/socialService'
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

/** A page of the battle list. History grows for an account's lifetime; a page does not. */
export const BATTLES_PAGE = 25
/** A page of a home-page feed. Small: every row on it costs a folded log, and the page shows three at once. */
const PUBLIC_BATTLES_PAGE = 10
const PLAYED_ARMY_BATTLES = 12
/** How long one public feed page serves repeated reads, such as a burst of tabs refetching after the same signal. */
const PUBLIC_FEED_HOLD_MS = 5_000
const PUBLIC_FEED_HELD_PAGES = 200

/** How far back the standings look, and how many battles they will read to do it. */
const DAY_MS = 24 * 60 * 60 * 1000
const STANDINGS_WINDOW_MS = 90 * DAY_MS
const STANDINGS_BATTLE_LIMIT = 500
/** Pages of 500 battles a club table reads before it reports itself partial. */
const CLUB_STANDINGS_PAGES = 20
const CLUB_RECENT_BATTLES = 3
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
type SubmitAnswer = { result: SubmitResult; screen: SeatedScreen; battleId: string; applied?: boolean; finished?: BattleEndReason }
type SubmitArgs = [
  token: string,
  userId: string,
  expectedSeq: number,
  command: Command,
  rules?: LoadedRules | null,
  sync?: { operationId: string; fingerprint: string; recordedAt: number },
]

export class PraetoriumService {
  readonly leagueService: LeagueService
  readonly clubService: ClubService
  readonly rosterService: RosterService
  readonly socialService: SocialService

  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly randomIndex: (limit: number) => number,
    private readonly notifier: Notifier = silentNotifier,
    private readonly standingsRevision?: () => Promise<string>,
  ) {
    this.leagueService = new LeagueService(repository, clock, notifier)
    this.clubService = new ClubService(repository, clock, notifier)
    this.rosterService = new RosterService(repository, clock)
    this.socialService = new SocialService(repository, clock, notifier)
  }

  onboardingProgress(userId: string) {
    return this.repository.onboardingProgress(userId)
  }

  updateOnboardingProgress(userId: string, operation: OnboardingProgressOperation) {
    return this.repository.updateOnboardingProgress(userId, operation)
  }

  collectionProfile(userId: string, viewerId: string | null) {
    return this.repository.collectionProfile(userId, viewerId)
  }

  /** The last standings folded, and when they stop being offered. See `standings`. */
  private standingsHeld: { key: string; until: number; fold: StandingsFold } | null = null
  private readonly publicFeedHeld = new Map<string, { until: number; page: Promise<unknown> }>()
  private standingsPending: { key: string; promise: Promise<StandingsFold> } | null = null

  adminUsers(input: Parameters<SpacetimeRepository['adminUsers']>[0]) {
    return this.repository.adminUsers(input)
  }

  userById(id: string) {
    return this.repository.userById(id)
  }

  adminEmails() {
    return this.repository.adminEmails()
  }

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
    page?: { limit?: number; before?: BattlesCursor },
    factions?: readonly BattleFaction[],
  ) {
    const now = this.clock()
    const key = JSON.stringify([viewerId, page?.limit ?? PUBLIC_BATTLES_PAGE, page?.before ?? null])
    const held = this.publicFeedHeld.get(key)
    if (held && held.until > now) return held.page as ReturnType<typeof read>
    const read = async () => {
      const { battles: histories, nextCursor } = await this.repository.publicBattles({
        limit: page?.limit ?? PUBLIC_BATTLES_PAGE,
        before: page?.before,
        viewerId,
      })
      return { battles: this.battleSummaries(histories, viewerId, rules, factions), nextCursor }
    }
    const pending = read()
    this.publicFeedHeld.set(key, { until: now + PUBLIC_FEED_HOLD_MS, page: pending })
    pending.catch(() => this.publicFeedHeld.delete(key))
    for (const [heldKey, entry] of this.publicFeedHeld)
      if (entry.until <= now || this.publicFeedHeld.size > PUBLIC_FEED_HELD_PAGES) this.publicFeedHeld.delete(heldKey)
    return pending
  }

  /**
   * The armies finished battles in one page of the public feed fielded, read without the feed's
   * hold. A page holds only finished battles, so it can come back short; its cursor still continues.
   */
  async playedArmies(viewerId: string | null, before?: BattlesCursor, factions: readonly BattleFaction[] = []) {
    const { battles: histories, nextCursor } = await this.repository.publicBattles({ limit: PLAYED_ARMY_BATTLES, before, viewerId })
    return { armies: histories.flatMap((history) => this.playedArmiesOf(history, factions)), nextCursor }
  }

  /** One army from a finished battle, or nothing. */
  async playedArmy(token: string, playerId: string) {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history || !this.mayWatch(history)) return null
    return this.playedArmiesOf(history, []).find((army) => army.player.id === playerId) ?? null
  }

  private playedArmiesOf(history: BattleHistory, factions: readonly BattleFaction[]) {
    const state = foldHistory(history)
    return playedArmies(history, state, battleSummary(history, state, null, null, byId(factions)))
  }

  /** The battles this player's friends are in and they are not. */
  async friendBattles(
    userId: string,
    rules?: BattleMissionRules | null,
    page?: { limit?: number; before?: BattlesCursor },
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
    const practised = new Set(practice.map((opponent) => opponent.id))
    const summaries = this.recordBattles(
      seated.filter((history) => !history.players.some((player) => practised.has(player.id))),
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
      performance: personalPerformance(summaries, userId, filter),
      facets,
      // What each side did is the record's to count, not the battle list's to carry.
      battles: shown.slice(0, PROFILE_BATTLE_PAGE).map(({ plays: _plays, ...battle }) => battle),
      played: shown.length,
    }
  }

  /** Datasheets in the player's own armies across their recent battles, with how many battles each appeared in, except armies they have archived. */
  async fieldedDatasheets(userId: string) {
    const [seated, rosters] = await Promise.all([
      this.repository.battlesSeatedBy(userId, PROFILE_BATTLE_LIMIT, userId),
      this.repository.rostersByUser(userId),
    ])
    const archived = archivedArmies(rosters)
    const uses = new Map<string, number>()
    for (const history of seated) {
      const built = foldHistory(history).players.find((player) => player.id === userId)?.roster?.built
      if (built && archived.has(currentCatalogueFamilyId(built.catalogueId))) continue
      const entries = new Set([
        ...(built?.picks ?? []).map((pick) => pick.entryId),
        ...(built?.units ?? []).flatMap((unit) => (unit.entryId ? [unit.entryId] : [])),
      ])
      for (const entryId of entries) uses.set(entryId, (uses.get(entryId) ?? 0) + 1)
    }
    return [...uses].map(([entryId, battles]) => ({ entryId, battles })).toSorted((a, b) => b.battles - a.battles)
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

  /** The standalone simulator pairings this player reopened most recently, newest first. */
  async recentMatchups(userId: string): Promise<RecentMatchup[]> {
    return (await this.repository.recentMatchupsByUser(userId)).map(({ shared, attacker, defender }) => ({ shared, attacker, defender }))
  }

  rememberMatchup(userId: string, matchup: RecentMatchup) {
    const pairing = simulatorPairing(matchup.shared)
    if (!pairing) throw new Error('Choose both units before remembering a matchup.')
    return this.repository.rememberMatchup({ userId, pairing, ...matchup, now: this.clock() })
  }

  async forgetMatchup(userId: string, shared: string) {
    const pairing = simulatorPairing(shared)
    if (pairing) await this.repository.forgetMatchup(userId, pairing)
  }

  /** The alerts this player set for abilities, which every roster they field applies to its units. */
  abilityReminders(userId: string) {
    return this.repository.abilityRemindersByUser(userId)
  }

  async setAbilityReminder(userId: string, reminder: AbilityReminder) {
    if ((await this.repository.saveAbilityReminder(userId, reminder, this.clock())) === 'full')
      throw new Response(ABILITY_REMINDERS_FULL, { status: 409 })
  }

  async removeAbilityReminder(userId: string, key: string) {
    await this.repository.deleteAbilityReminder(userId, key)
  }

  registerPushDevice(userId: string, device: { token: string; platform: 'ios' | 'android' }) {
    return this.repository.registerPushToken({ userId, ...device, now: this.clock() })
  }

  unregisterPushDevice(userId: string, token: string) {
    return this.repository.unregisterPushToken(userId, token)
  }

  /** Every battle with a seated player is open to watch; a table nobody sits at is not. */
  private mayWatch(history: BattleHistory) {
    return history.players.length > 0
  }

  async leagueBattles(
    leagueToken: string,
    eventToken: string,
    page: { limit: number; before?: BattlesCursor },
    rules?: BattleMissionRules | null,
    factions?: readonly BattleFaction[],
    viewerId: string | null = null,
  ) {
    const { battles: histories, nextCursor } = await this.repository.battlesByLeagueEvent(leagueToken, eventToken, {
      ...page,
      viewerId,
    })
    return {
      battles: this.battleSummaries(
        histories.filter((history) => this.mayWatch(history)),
        viewerId,
        rules,
        factions,
      ),
      nextCursor,
    }
  }

  /** A revealed event's results table and who has met whom, from the battles this reader may watch. */
  async leagueResults(
    leagueToken: string,
    eventToken: string,
    rules?: BattleMissionRules | null,
    factions?: readonly BattleFaction[],
    viewerId: string | null = null,
  ) {
    const league = await this.leagueService.league(leagueToken, viewerId, eventToken)
    if (!league?.revealedAt) return null
    const { battles, nextCursor } = await this.leagueBattles(
      leagueToken,
      eventToken,
      { limit: LEAGUE_RESULTS_BATTLE_LIMIT },
      rules,
      factions,
      viewerId,
    )
    const entrantIds = league.entries.filter((entry) => entry.status === 'accepted').map((entry) => entry.userId)
    return {
      ...leagueResults(entrantIds, battles),
      swiss: league.rounds === null ? null : swissStandings(entrantIds, swissMatches(league.pairings, battles), droppedIds(league.entries)),
      partial: nextCursor !== null,
    }
  }

  /** Pairs the next Swiss round from the results so far. */
  async pairLeagueRound(leagueToken: string, eventToken: string | undefined, userId: string) {
    const league = await this.leagueService.league(leagueToken, userId, eventToken)
    if (!league) throw new Response('no such event', { status: 404 })
    if (league.rounds === null || !league.revealedAt) throw new Response('pair rounds once the rosters are out', { status: 409 })
    const { battles, nextCursor } = await this.leagueBattles(
      leagueToken,
      league.eventToken,
      { limit: LEAGUE_RESULTS_BATTLE_LIMIT },
      null,
      [],
      userId,
    )
    // A battle past the read limit would read as unplayed and skew every score the pairing depends on.
    if (nextCursor !== null) throw new Response('this event has too many battles to pair its next round', { status: 409 })
    const players = league.entries.filter((entry) => entry.status === 'accepted' && entry.submitted).map((entry) => entry.userId)
    const matches = swissMatches(league.pairings, battles)
    const round = Math.max(0, ...league.pairings.map((pairing) => pairing.round)) + 1
    const result = await this.repository.pairLeagueRound({
      token: leagueToken,
      eventToken: league.eventToken,
      ownerId: userId,
      round,
      pairs: swissPairings(players, matches, Math.random, droppedIds(league.entries)),
    })
    if (result === 'paired') {
      this.notifier.notify([
        { kind: 'league-round-paired', actorId: userId, recipientIds: players, leagueToken, eventToken: league.eventToken, round },
      ])
      return { round }
    }
    if (result === 'forbidden') throw new Response('only the organizer pairs rounds', { status: 403 })
    if (result === 'not-ready') throw new Response('every table must finish its battle before the next round', { status: 409 })
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    throw new Response('the round changed while it was being paired; try again', { status: 409 })
  }

  /**
   * A club's standing table: every battle tagged for it, rated together, with rows for its current members only, so
   * someone who leaves drops off and comes back with their record if they rejoin. A private club shows it to members alone.
   */
  async clubStandings(token: string, viewerId: string | null, factions: readonly BattleFaction[] = []) {
    const club = await this.clubService.club(token, viewerId)
    if (!club) return null
    const memberIds = new Set(club.members.filter((member) => member.status === 'accepted').map((member) => member.userId))
    if (club.visibility === 'private' && !(viewerId && memberIds.has(viewerId))) return null
    const histories: BattleHistory[] = []
    let before: BattlesCursor | undefined
    for (let page = 0; page < CLUB_STANDINGS_PAGES; page++) {
      const { battles, nextCursor } = await this.repository.battlesByClub(token, { limit: LEAGUE_RESULTS_BATTLE_LIMIT, before })
      histories.push(...battles)
      before = nextCursor ?? undefined
      if (!before) break
    }
    const practice = await this.repository.practiceOpponents()
    // A game's battles name its event; one from before events were recorded on battles names only its league, now this club.
    const gameEvents = new Set(club.games.map((game) => game.token))
    // A sealed game lists its own battles, so the club's other lists keep to the ones played outside them.
    const fromGames = new Set<string>()
    const counted = this.battleSummaries(
      histories.filter((history) => {
        const state = foldHistory(history)
        const fromGame = state.leagueEventToken !== null && gameEvents.has(state.leagueEventToken)
        if (fromGame) fromGames.add(history.battle.token)
        return state.clubId === club.id || fromGame || (state.leagueEventToken === null && state.leagueToken === club.token)
      }),
      viewerId,
      null,
      factions,
    )
    const tables = standings(counted, { exclude: practice.map((opponent) => opponent.id) })
    const rows = tables.overall.filter((row) => memberIds.has(row.id))
    return {
      table: { faction: null, players: rows.length, rows },
      finished: counted.filter((battle) => battle.status === 'finished').length,
      recent: counted.filter((battle) => battle.status === 'finished' && !fromGames.has(battle.token)).slice(0, CLUB_RECENT_BATTLES),
      // The reader's own club battles still being set up or played, which is what they most likely came back for.
      active: viewerId
        ? counted.filter((battle) => battle.status !== 'finished' && battle.playerIds.includes(viewerId) && !fromGames.has(battle.token))
        : [],
      partial: before !== undefined,
    }
  }

  /** The club a battle counts for, and for a seated player during setup the clubs it could; a private club's name stays with its players. */
  async battleClubs(token: string, viewerId: string | null) {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    const seated = viewerId !== null && this.seated(seats, viewerId)
    const { current, options } = await this.repository.battleClubs(seats.battle.id)
    const summary = (club: { token: string; name: string }) => ({ token: club.token, name: club.name })
    return {
      current: current && (seated || current.visibility === 'public') ? summary(current) : null,
      options: seated ? options.map((club) => ({ id: club.id, ...summary(club) })) : [],
    }
  }

  private battleSummaries(
    histories: readonly BattleHistory[],
    viewerId: string | null,
    rules?: BattleMissionRules | null,
    factions: readonly BattleFaction[] = [],
  ) {
    const factionsById = byId(factions)
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
    const factionsById = byId(factions)
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
   * every battle and on every row of the leaderboard, so gating the page that
   * shows the same name behind a friendship only produced links that led
   * nowhere; who a player is was never a secret the product was keeping.
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
    const settings =
      typeof input === 'object' ? { ...input, limit: input.limit ?? null } : { limit: null, missionPackId: null, manual: false }
    const { allyIds, opponentIds, guestNames, invited } = newBattleSeats(input)
    // One query for everyone named rather than one apiece, and both reads at once:
    // who exists and who may be invited are independent questions.
    const [known, invitable] = await Promise.all([this.repository.namesByIds(invited), this.socialService.opponents(userId)])
    if (new Set(invited).size !== invited.length || invited.some((id) => id === userId || !known.has(id))) {
      throw new Response('choose an opponent', { status: 400 })
    }
    const allowed = new Map(invitable.map((opponent) => [opponent.id, opponent]))
    // Joining a club is consent to play its members, so a club game needs no friendship; the product database checks membership again.
    const clubToken = typeof input === 'object' ? input.clubToken : undefined
    const club = clubToken ? await this.clubService.club(clubToken, userId) : null
    if (clubToken) {
      const members = new Set(club?.members.filter((member) => member.status === 'accepted').map((member) => member.userId))
      if (!club || !members.has(userId) || guestNames.length || invited.some((id) => !members.has(id)))
        throw new Response('a club game is played between its members', { status: 403 })
    } else if (invited.some((id) => !allowed.has(id)))
      throw new Response('battle players must be your friends or a practice opponent', { status: 403 })
    // How many chairs a battle has is `battleCapacity`'s to say, here as everywhere.
    if (invited.length + guestNames.length >= battleCapacity({ teamBattle: true, playerCount: 4 }))
      throw new Response('a battle seats four players at most', { status: 400 })
    // Every battle names its table. There is no opening a game and waiting to see
    // who turns up, so a battle without an opponent is not a battle yet.
    if (!opponentIds.length && !guestNames.length) throw new Response('choose an opponent', { status: 400 })
    // A league seats its own entrants, so a table with a guest at it can only be casual.
    if (!club && invited.length && !guestNames.length && (typeof input !== 'object' || !input.casual)) {
      const leagueMatches = await this.leagueBattleOptions(userId, input)
      if (leagueMatches.length) {
        throw new Response('start this matchup from its event page, or confirm a casual battle', { status: 409 })
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
      guestNames,
      initialCommands: [
        {
          kind: 'configure-battle',
          limit: settings.limit,
          missionPackId: settings.manual ? null : settings.missionPackId,
          terrainLayoutId: null,
          twistId: null,
          teamBattle: invited.length + guestNames.length >= 2,
          playerCount: (invited.length + guestNames.length + 1) as 2 | 3 | 4,
          clockLimitMinutes: null,
          ...(settings.manual ? { manual: true } : {}),
        },
        ...(club ? [{ kind: 'set-battle-club' as const, clubId: club.id }] : []),
      ],
      now: offlineContext.getStore()?.createdAt ?? this.clock(),
    })
    this.notifier.notify([{ kind: 'battle-created', actorId: userId, recipientIds: invited, battleToken: token, league: false }])
    return { battleId: id, token, practice }
  }

  async leagueBattleOptions(userId: string, input?: string | NewBattlePlayers) {
    const { opponentIds, invited } = newBattleSeats(input)
    const participantIds = [userId, ...invited]
    if (!opponentIds.length || new Set(participantIds).size !== participantIds.length) return []
    const candidates = await this.repository.leagueBattleCandidates(userId, participantIds)
    return matchingLeagueBattles(candidates, userId, input)
  }

  /** Who sat at each of a player's latest battles and how far it got. The battles themselves still open through `mayWatch`. */
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
    return seats.battle.id
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
    if (viewerId !== SPECTATOR_ID) return this.seatedScreen(history, viewerId, rules)
    const screen = this.battleScreen(history, viewerId, rules)
    // Everyone else either watches or is told no. Nobody arrives here to sit down:
    // the seats were filled when the battle was created.
    if (!this.mayWatch(history)) return { kind: 'unavailable' }
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
    const labels = new Map(report.map((entry) => [entry.seq, entry.text]))
    const kinds = new Map(history.log.map((entry) => [entry.seq, entry.command.kind]))
    return battleTimeline(...battleFoldArgs(history.players, history.log)).map((point) => ({
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
    const history = await this.mustSeatHistory(token, userId)
    return this.viewerReport(history, userId, rules)
  }

  async battleWorkspace(
    token: string,
    userId: string,
    rules?: BattleReadRules | null,
  ): Promise<{ workspace: BattleWorkspace; screen: SeatedScreen }> {
    const history = await this.mustSeatHistory(token, userId)
    const workspace = this.workspace(history, userId)
    if (!workspace) throw new Response('this battle exceeds the offline history limit', { status: 409 })
    return { workspace, screen: this.seatedScreen(history, userId, rules) }
  }

  private workspace(history: BattleHistory, userId: string): BattleWorkspace | undefined {
    if (history.log.length > 10_000) return undefined
    return {
      ...history,
      log: visibleBattleLog(history.players, history.log, userId),
      serverSeq: history.log.at(-1)?.seq ?? 0,
      serverNow: this.clock(),
    }
  }

  syncReceipt(...args: Parameters<RepositoryPort['syncReceipt']>) {
    return this.repository.syncReceipt(...args)
  }

  syncRoster(...args: Parameters<RepositoryPort['syncRoster']>) {
    return this.repository.syncRoster(...args)
  }

  async hasBattleOperation(token: string, userId: string, operationId: string) {
    const history = await this.mustSeatHistory(token, userId)
    return history.log.some((entry) => entry.operationId === operationId && entry.by === userId)
  }

  async submit(...args: SubmitArgs): Promise<SubmitAnswer> {
    const [, userId, , , rules] = args
    const { result, previous, history, application } = await this.append(...args)
    const screen = this.seatedScreen(history, userId, rules)
    return { result, screen, battleId: history.battle.id, ...application, ...finishing(result, previous, screen) }
  }

  /** The answer with the submitting device's copy of the history, so it is saved without a second download. */
  async submitWithWorkspace(...args: SubmitArgs): Promise<SubmitAnswer & { workspace?: BattleWorkspace }> {
    const [, userId, , , rules] = args
    const { result, previous, history, application } = await this.append(...args)
    const screen = this.seatedScreen(history, userId, rules)
    return {
      result,
      screen,
      workspace: this.workspace(history, userId),
      battleId: history.battle.id,
      ...application,
      ...finishing(result, previous, screen),
    }
  }

  private async append(...[token, userId, expectedSeq, command, rules, sync]: SubmitArgs) {
    const history = await this.mustSeatHistory(token, userId)
    if (sync) command = restoreOpaqueBattleKeys(history.players, history.log, command)
    if (command.kind === 'lock-league-rosters') throw new Response('sealed roster locks are created by the server', { status: 403 })
    // The product database refuses a non-member too; asking first gives the refusal its code.
    const clubId = command.kind === 'set-battle-club' ? command.clubId : null
    const clubRefusal =
      clubId && !(await this.repository.battleClubs(history.battle.id)).options.some((club) => club.id === clubId)
        ? refuse('club-members-only', 'every player must be a member of the club')
        : null
    // The log comes back with the answer, so a refusal and a lost race both report
    // the state that refused them rather than the one the caller was holding —
    // and without a second read of a history the append had already in hand.
    const { result, log, applied } = await this.repository.submit(
      {
        battleId: history.battle.id,
        userId,
        expectedSeq,
        command,
        now: this.clock(),
        snapshot: { seats: history.players, log: history.log },
        ...sync,
      },
      (state) => {
        if (clubRefusal) return clubRefusal
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
        if (rules && submitted.kind === 'set-prep')
          return withAuthoritativeAwards(submitted, rules, state.status === 'playing' ? commandArmy(state, userId, submitted) : undefined)
        if (rules && submitted.kind === 'attach-roster' && submitted.prep) {
          return {
            ...submitted,
            prep: withAuthoritativeAwards(
              submitted.prep,
              rules,
              state.status === 'playing' ? commandArmy(state, userId, submitted) : undefined,
            ),
          }
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
    return { result, previous: history, history: { ...history, log }, application: applied === undefined ? {} : { applied } }
  }

  /**
   * The link a seated account shares so a guest plays their own side. `replace` retires the old link and any device
   * that joined through it, so the table plays the seat again until someone opens the new one.
   */
  async guestInvite(token: string, userId: string, seatId: string, replace = false) {
    const seats = await this.mustSeat(token, userId)
    if (isGuestSeat(userId)) throw new Response('only a signed-in player can invite a guest', { status: 403 })
    const seat = seats.players.find((player) => player.id === seatId && isGuestSeat(player.id))
    if (!seat) throw new Response('no such guest in this battle', { status: 404 })
    const invite = await this.repository[replace ? 'replaceGuestInvite' : 'guestInvite'](seats.battle.id, seatId, randomToken())
    return { invite, joined: !replace && !seat.automated }
  }

  async guestInvitation(invite: string) {
    const seat = await this.repository.guestSeatByInvite(invite)
    return seat && { token: seat.token, seatId: seat.seatId, guestName: seat.guestName, hostName: seat.hostName, joined: seat.joined }
  }

  /** Seats this device in the guest's chair and returns the secret it will prove that with; the server keeps only its hash. */
  async joinGuest(invite: string, userId: string | null) {
    const seat = await this.repository.guestSeatByInvite(invite)
    if (!seat) throw new Response('this invite is no longer available', { status: 404 })
    if (userId && (await this.repository.battleByToken(seat.token))?.players.some((player) => player.id === userId))
      throw new Response('you already have a seat in this battle', { status: 400 })
    const secret = randomToken()
    const joined = await this.repository.joinGuestSeat(invite, guestDeviceHash(secret), this.clock())
    if (joined === 'missing') throw new Response('this invite is no longer available', { status: 404 })
    if (joined === 'taken') throw new Response(`${seat.guestName} already joined on another device`, { status: 409 })
    return { token: joined.token, seatId: joined.seatId, secret }
  }

  /** The guest seat a device's secret holds in this battle, or null once the host replaced the link or the session lapsed. */
  async guestSeat(token: string, held: { seat: string; secret: string }) {
    const device = await this.repository.guestDevice(held.seat)
    if (!device || device.token !== token || !guestSessionCurrent(device.joinedAt, this.clock())) return null
    return constantTimeEqual(device.deviceHash, guestDeviceHash(held.secret)) ? held.seat : null
  }

  /** Moves the guest seat this device played onto the account that has just signed in, once the battle is over. */
  async claimGuest(token: string, userId: string, held: { seat: string; secret: string }) {
    const device = await this.repository.guestDevice(held.seat)
    if (!device || device.token !== token) throw new Response('this device is not playing that seat', { status: 403 })
    const outcome = await this.repository.claimGuestSeat({
      battleId: device.battleId,
      seatId: held.seat,
      userId,
      deviceHash: guestDeviceHash(held.secret),
      now: this.clock(),
    })
    if (outcome !== 'claimed') throw new Response(outcome, { status: 409 })
  }

  /** Opening a battle stream is an authorization decision. */
  async userBattleId(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    return seats.battle.id
  }

  private seatedScreen(history: BattleHistory, userId: string, rules?: BattleReadRules | null): SeatedScreen {
    const screen = this.battleScreen(history, userId, rules)
    return screen.view.status === 'finished'
      ? { ...screen, timeline: this.replayTimeline(history, this.viewerReport(history, userId, rules)) }
      : screen
  }

  /** The only place a visibility-filtered battle view is built. */
  private battleScreen(history: BattleHistory, userId: string, rules?: BattleReadRules | null): SeatedScreen {
    const fold = battleFoldArgs(history.players, history.log)
    const state = reduceBattle(...fold)
    if (rules) hydrateAuthoritativeAwards(state, rules)
    const view = battleView(history.battle, history.players, state, userId)
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

  private async mustSeatHistory(token: string, userId: string) {
    const history = await this.mustFind(token)
    if (!this.seated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    return history
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

/** How an appended command finished the battle, read from the folds on either side of it rather than from its kind. */
function finishing(result: SubmitResult, previous: BattleHistory, screen: SeatedScreen): { finished?: BattleEndReason } {
  if (result.outcome !== 'appended' || screen.view.status !== 'finished' || !screen.view.result) return {}
  return foldHistory(previous).status === 'finished' ? {} : { finished: screen.view.result.reason }
}

function foldHistory({ players, log }: BattleHistory) {
  return reduceBattle(...battleFoldArgs(players, log))
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
    const opposing = opposingSide(state, player.side)
    const you = sideDisposition(state, player.side)
    const opponent = opposing === undefined ? null : sideDisposition(state, opposing)
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

/** What the service keeps of a guest device's secret, and what that device's realtime token names it by. */
export function guestDeviceHash(secret: string) {
  return createHash('sha256').update(secret).digest('hex')
}

const droppedIds = (entries: readonly { userId: string; dropped: boolean }[]) =>
  new Set(entries.filter((entry) => entry.dropped).map((entry) => entry.userId))

/** Each paired table as a Swiss result, read from the battle it started; a table still playing has no outcome yet. */
function swissMatches(
  pairings: readonly { round: number; aId: string; bId: string | null; battleToken: string | null }[],
  battles: readonly (StandingBattle & { token: string })[],
): SwissMatch[] {
  const byToken = new Map(battles.map((battle) => [battle.token, battle]))
  return pairings.map((pairing) => {
    const battle = pairing.battleToken ? byToken.get(pairing.battleToken) : undefined
    if (!pairing.bId || battle?.status !== 'finished')
      return { round: pairing.round, a: pairing.aId, b: pairing.bId, outcome: null, vp: [0, 0] }
    const sideA = battle.sides[battle.playerIds.indexOf(pairing.aId)] ?? 0
    const sideB = battle.sides[battle.playerIds.indexOf(pairing.bId)] ?? 1
    const outcome = battleOutcome(battle, sideA)
    return {
      round: pairing.round,
      a: pairing.aId,
      b: pairing.bId,
      outcome: outcome === 'won' ? 'a' : outcome === 'lost' ? 'b' : 'draw',
      vp: [sideScore(battle, sideA), sideScore(battle, sideB)],
    }
  })
}
