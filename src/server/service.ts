import type { BattleEvents } from '../adapters/events'
import { randomId, randomToken } from 'ras-stack/auth'
import {
  battleCapacity,
  type BattleState,
  type Command,
  commandArmy,
  FIXED_SECONDARIES,
  FORMAT_RULE_IDS,
  type FormatRuleId,
  OPTIONAL_RULE_IDS,
  type OptionalRuleId,
  GAME_SIZES,
  type PlayerId,
  type Roster,
  reduceBattle,
  type Secondary,
  scoringTarget,
  sideCaptain,
  sideDisposition,
  sidePaintedPoints,
  type Stratagem,
  type SubmitResult,
} from '../core/battle'
import { type BattleAudience, battleAudience, maySpectate } from '../core/battleAudience'
import { type BattleView, battleView } from '../core/battleView'
import { battleReport } from '../core/battleReport'
import type { MissionAward } from '../core/scoring'
import type { RosterPick } from '../core/roster'
import type { RosterSource } from '../core/savedRoster'
import { type Standing, STANDING_SUBJECTS, type StandingSubject, standings } from '../core/standings'
import {
  alliedLeagueRosterLimit,
  leagueTableShape,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_MEMBER_MAX,
  LEAGUE_TEAM_ROSTER_LIMITS,
  type LeagueAdmission,
  type LeagueEntryStatus,
  type LeagueVisibility,
  visibleLeagueEntries,
} from '../core/league'
import type { TableShape } from '../core/tableShape'
import { commandSchema, parseRosterSnapshot } from '../core/commands'
import type { BattleHistory, BattleSeats, BattlesCursor, Repository } from '../db/repository'
import { type Mission, missionFor } from './rules'
import { picksSchema, savedPrepSchema } from './schemas'

type SavedPrep = { stratagems: Stratagem[]; secondaries: Secondary[] }

/**
 * `mission` is the viewer's, for the screens that are about them. `missions` is every
 * side's, because a ceiling is enforced against the side being scored, either player
 * may record a settlement for the side the turn came back to, and a side nobody signs
 * in to has its cards settled by the table facing it.
 */
type SeatedScreen = { kind: 'battle'; view: BattleView; mission: Mission | null; missions: { side: number; mission: Mission | null }[] }
type SpectatorScreen = {
  kind: 'spectator'
  view: BattleView
  missions: { side: number; mission: Mission | null }[]
  report: ReturnType<typeof battleReport>
}

/**
 * A link resolves to a seated screen, a spectator screen, or nothing.
 *
 * There is no fourth answer offering a seat. A battle names everyone in it at the
 * moment it is created, so no chair is ever standing empty for a link to fill.
 */
type BattleScreen = SeatedScreen | SpectatorScreen | { kind: 'unavailable' }

/** Every standings table, and the window they were folded over. */
type StandingsAnswer = Record<StandingSubject, Standing[]> & { since: number }

const SPECTATOR_ID = ''

/** A page of a home-page feed. Small: every row on it costs a folded log. */
const PUBLIC_BATTLES_PAGE = 10

/** How far back the standings look, and how many battles they will read to do it. */
const STANDINGS_WINDOW_MS = 90 * 24 * 60 * 60 * 1000
const STANDINGS_BATTLE_LIMIT = 500
const STANDINGS_HOLD_MS = 60_000

/**
 * What a command answers: what happened to it, and what the battle now is.
 *
 * The screen comes back with the answer because the client's next command is
 * conditional on this one having landed. Left to learn that from the refetch a
 * round trip later, a page acts on a view it has already changed — sending a seq
 * from before its own command, or naming the wrong command to undo.
 */
type SubmitAnswer = { result: SubmitResult; screen: SeatedScreen }
type NewBattlePlayers = { opponentId?: string; opponentIds?: string[]; allyId?: string }
type CreateBattleInput = NewBattlePlayers & { limit?: number; missionPackId: string | null; casual?: boolean }

function newBattleSeats(input?: string | NewBattlePlayers) {
  const opponentIds = typeof input === 'string' ? [input] : (input?.opponentIds ?? (input?.opponentId ? [input.opponentId] : []))
  const allyIds = typeof input === 'object' && input.allyId ? [input.allyId] : []
  return { allyIds, opponentIds, invited: [...allyIds, ...opponentIds] }
}

export class PraetoriumService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
    private readonly events: BattleEvents,
    private readonly randomIndex: (limit: number) => number,
  ) {}

  /** The last standings folded, and when they stop being offered. See `standings`. */
  private standingsHeld: { until: number; answer: StandingsAnswer } | null = null

  adminUsers(input: Parameters<Repository['adminUsers']>[0]) {
    return this.repository.adminUsers(input)
  }

  userById(id: string) {
    return this.repository.userById(id)
  }

  async createLeague(
    ownerId: string,
    input: {
      name: string
      description: string
      visibility: LeagueVisibility
      admission: LeagueAdmission
      playerLimit: number | null
      recurring?: boolean
      format?: TableShape
      rosterLimit?: number
    },
  ) {
    const id = randomId()
    const token = randomToken()
    const eventId = randomId()
    const eventToken = randomToken()
    const format = leagueTableShape(input.format)
    const rosterLimit = input.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT
    if (format !== '1v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === rosterLimit)) {
      throw new Response(`choose a supported ${format} roster size`, { status: 400 })
    }
    if (format === '2v1' && input.playerLimit !== null && input.playerLimit < 3) {
      throw new Response('a 2v1 event needs at least three places', { status: 400 })
    }
    if (format === '2v2' && input.playerLimit !== null && (input.playerLimit < 4 || input.playerLimit % 2 !== 0)) {
      throw new Response('a 2v2 event needs an even number of at least four places', { status: 400 })
    }
    await this.repository.createLeague({
      id,
      token,
      eventId,
      eventToken,
      ownerId,
      ...input,
      recurring: true,
      format,
      rosterLimit,
      now: this.clock(),
    })
    return { token, eventToken }
  }

  async createLeagueEvent(token: string, ownerId: string, rule: { format?: TableShape; rosterLimit?: number } = {}) {
    const eventToken = randomToken()
    const format = leagueTableShape(rule.format)
    const rosterLimit = rule.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT
    if (format !== '1v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === rosterLimit)) {
      throw new Response(`choose a supported ${format} roster size`, { status: 400 })
    }
    const result = await this.repository.createLeagueEvent({
      id: randomId(),
      token: eventToken,
      leagueToken: token,
      ownerId,
      format,
      rosterLimit,
      now: this.clock(),
    })
    if (result === 'created') return { eventToken }
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can start an event', { status: 403 })
    if (result === 'too-small')
      throw new Response(
        format === '2v2' ? 'a 2v2 event needs an even number of at least four places' : 'a 2v1 event needs at least three places',
        {
          status: 409,
        },
      )
    throw new Response('reveal the current event before starting another', { status: 409 })
  }

  async makeLeagueRecurring(token: string, ownerId: string) {
    const result = await this.repository.makeLeagueRecurring(token, ownerId)
    if (result === 'updated') return
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    throw new Response('only the organizer can make a league recurring', { status: 403 })
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
  ) {
    const result = await this.repository.updateLeague(token, ownerId, input)
    if (result === 'updated') return
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can edit this league', { status: 403 })
    if (result === 'joined') throw new Response('joining cannot change after someone has joined the current event', { status: 409 })
    if (result === 'team-minimum') throw new Response('the open team event needs a supported number of places', { status: 409 })
    throw new Response('the player limit cannot be lower than the accepted entrant count', { status: 409 })
  }

  async deleteLeague(token: string, ownerId: string) {
    const result = await this.repository.deleteLeague(token, ownerId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    throw new Response('only the organizer can delete this league', { status: 403 })
  }

  leagues(userId: string | null) {
    return this.repository.leaguesVisibleTo(userId)
  }

  async league(token: string, viewerId: string | null, eventToken?: string) {
    const league = await this.repository.leagueByToken(token, viewerId, eventToken)
    if (!league) return null
    return { ...league, entries: visibleLeagueEntries(league.entries, league.ownerId, viewerId) }
  }

  async joinLeague(token: string, userId: string, eventToken?: string) {
    const result = await this.repository.joinLeague(token, userId, this.clock(), LEAGUE_MEMBER_MAX, eventToken)
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'closed') throw new Response('this event has already revealed its rosters', { status: 409 })
    if (result === 'full') throw new Response('this event is full', { status: 409 })
    return result
  }

  async moderateLeagueEntry(
    token: string,
    ownerId: string,
    userId: string,
    status: Extract<LeagueEntryStatus, 'accepted' | 'rejected'>,
    eventToken?: string,
  ) {
    const result = await this.repository.moderateLeagueEntry(token, ownerId, userId, status, LEAGUE_MEMBER_MAX, eventToken)
    if (result === 'updated') return
    if (result === 'forbidden') throw new Response('only the organizer can change entrants', { status: 403 })
    if (result === 'closed') throw new Response('this event has already revealed its rosters', { status: 409 })
    if (result === 'full') throw new Response('this event is full', { status: 409 })
    throw new Response('no such event entrant', { status: 404 })
  }

  async assignLeagueRosterRequirement(token: string, ownerId: string, userId: string, requiredLimit: number, eventToken?: string) {
    const result = await this.repository.assignLeagueRosterRequirement(token, ownerId, userId, requiredLimit, eventToken)
    if (result === 'updated') return { requiredLimit }
    if (result === 'forbidden') throw new Response('only the organizer can assign roster sizes', { status: 403 })
    if (result === 'closed') throw new Response('roster sizes cannot change after reveal', { status: 409 })
    if (result === 'wrong-format') throw new Response('1v1 roster sizes are assigned automatically', { status: 409 })
    if (result === 'wrong-limit') throw new Response('choose a roster size configured for this event', { status: 400 })
    throw new Response('no such accepted event entrant', { status: 404 })
  }

  async assignLeagueTeam(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.assignLeagueTeam(token, ownerId, userIds, randomId(), eventToken)
    if (result === 'updated') return { teamSize: userIds.length }
    if (result === 'forbidden') throw new Response('only the organizer can assign teams', { status: 403 })
    if (result === 'closed') throw new Response('teams cannot change after reveal', { status: 409 })
    if (result === 'wrong-format') throw new Response('teams are assigned only for 2v2 events', { status: 409 })
    throw new Response('choose accepted event entrants', { status: 404 })
  }

  async ownRoster(userId: string, rosterId: string) {
    const row = await this.repository.roster(rosterId)
    if (!row || row.userId !== userId) return null
    return rosterFromRow(row)
  }

  async submitLeagueRoster(
    token: string,
    userId: string,
    roster: { id: string; limit: number; updatedAt: number },
    snapshot: Roster,
    eventToken?: string,
  ) {
    const command = commandSchema.parse({ kind: 'attach-roster', roster: snapshot })
    if (command.kind !== 'attach-roster') throw new Error('expected a roster snapshot')
    const { id: _savedRosterId, ...sealed } = command.roster
    const result = await this.repository.submitLeagueRoster({
      token,
      userId,
      rosterId: roster.id,
      rosterName: sealed.name,
      rosterLimit: roster.limit,
      rosterUpdatedAt: roster.updatedAt,
      snapshot: JSON.stringify(sealed),
      now: this.clock(),
      eventToken,
    })
    if (result.outcome === 'sealed') return result
    if (result.outcome === 'unassigned') throw new Response('wait for the organizer to assign your event role or team', { status: 409 })
    if (result.outcome === 'wrong-limit') throw new Response('choose a roster built for your assigned size', { status: 409 })
    if (result.outcome === 'invalid-warlords')
      throw new Response(
        result.format === '2v2'
          ? 'a doubles team must seal exactly one Character or Epic Hero Warlord between both rosters'
          : 'a league roster must seal exactly one Character or Epic Hero Warlord',
        { status: 409 },
      )
    throw new Response('the roster could not be sealed; check your entry and roster, then try again', { status: 409 })
  }

  async revealLeague(token: string, ownerId: string, eventToken?: string) {
    const result = await this.repository.revealLeague(token, ownerId, this.clock(), eventToken)
    if (result.outcome === 'revealed') return
    if (result.outcome === 'invalid-warlords')
      throw new Response(
        result.format === '2v2'
          ? 'each doubles team must select exactly one eligible Warlord before reveal'
          : 'each league roster must select exactly one eligible Warlord before reveal',
        { status: 409 },
      )
    throw new Response('fill every configured place and wait for every accepted roster before reveal', { status: 409 })
  }

  async leagueRoster(token: string, userId: string, eventToken?: string) {
    const stored = await this.repository.leagueRoster(token, userId, eventToken)
    if (!stored) return null
    return parseRosterSnapshot(stored)
  }

  async createLeagueBattle(
    userId: string,
    leagueToken: string,
    opponentId: string,
    missionPackId: string | null,
    eventToken?: string,
    allyId?: string,
    secondOpponentId?: string,
  ) {
    const invited = [opponentId, allyId, secondOpponentId].filter((id): id is string => Boolean(id))
    if (new Set([userId, ...invited]).size !== invited.length + 1) throw new Response('choose different league entrants', { status: 400 })
    const token = randomToken()
    const id = randomId()
    const result = await this.repository.createLeagueBattle(
      { id, token, leagueToken, eventToken, userId, userIds: [userId, ...invited], now: this.clock() },
      (league) => {
        if (league.revealedAt === null) throw new Response('reveal the league rosters before starting a battle', { status: 409 })
        const expectedPlayers = league.format === '2v2' ? 4 : league.format === '2v1' ? 3 : 2
        if (league.format === '2v2' && !LEAGUE_TEAM_ROSTER_LIMITS.some((candidate) => candidate === league.rosterLimit)) {
          throw new Response('sealed rosters use an unsupported doubles force size', { status: 409 })
        }
        if (league.format !== '2v2' && (league.entries.length !== expectedPlayers || invited.length !== expectedPlayers - 1)) {
          throw new Response('choose accepted entrants with sealed rosters', { status: 403 })
        }
        const rosters = new Map(
          league.entries.map((entry) => {
            if (!entry.snapshot) throw new Error('accepted league entrant has no roster snapshot')
            return [entry.userId, parseRosterSnapshot(entry.snapshot)] as const
          }),
        )
        let participantIds = [userId, ...invited]
        let allyIds: string[] = []
        let opponentIds = [opponentId]
        if (league.format === '2v2') {
          if (invited.length !== 1 || allyId || secondOpponentId) throw new Response('choose one opposing doubles team', { status: 400 })
          const ownTeamId = league.entries.find((entry) => entry.userId === userId)?.teamId
          const opposingTeamId = league.entries.find((entry) => entry.userId === opponentId)?.teamId
          if (!ownTeamId || !opposingTeamId || ownTeamId === opposingTeamId)
            throw new Response('choose an opposing doubles team', { status: 409 })
          const ownTeam = league.entries.filter((entry) => entry.teamId === ownTeamId)
          const opposingTeam = league.entries.filter((entry) => entry.teamId === opposingTeamId)
          if (ownTeam.length !== 2 || opposingTeam.length !== 2)
            throw new Response('doubles teams must contain exactly two entrants', { status: 409 })
          allyIds = ownTeam.filter((entry) => entry.userId !== userId).map((entry) => entry.userId)
          opponentIds = [opponentId, ...opposingTeam.filter((entry) => entry.userId !== opponentId).map((entry) => entry.userId)]
          participantIds = [userId, ...allyIds, ...opponentIds]
        }
        const ownRoster = rosters.get(userId)
        const opponentRoster = rosters.get(opponentIds[0]!)
        const limit = league.format === null ? ownRoster?.built?.limit : league.rosterLimit
        if (!ownRoster || !opponentRoster || limit === null || limit === undefined)
          throw new Response('sealed rosters use an invalid battle size', { status: 409 })
        if (
          league.format !== '2v1' &&
          league.format !== '2v2' &&
          (ownRoster.built?.limit !== limit || opponentRoster.built?.limit !== limit)
        ) {
          throw new Response('sealed rosters must use the same battle size', { status: 409 })
        }
        if (!GAME_SIZES.some((size) => size.limit === limit))
          throw new Response('sealed rosters use an unsupported battle size', { status: 409 })

        if (league.format === '2v1') {
          const requirements = new Map(league.entries.map((entry) => [entry.userId, entry.requiredLimit]))
          const alliedLimit = alliedLeagueRosterLimit(limit)
          const creatorLimit = requirements.get(userId)
          if (creatorLimit === limit) {
            if (
              allyId ||
              !secondOpponentId ||
              requirements.get(opponentId) !== alliedLimit ||
              requirements.get(secondOpponentId) !== alliedLimit
            ) {
              throw new Response('a solo entrant must face two allied entrants', { status: 409 })
            }
            opponentIds = [opponentId, secondOpponentId]
          } else {
            if (
              creatorLimit !== alliedLimit ||
              !allyId ||
              secondOpponentId ||
              requirements.get(allyId) !== alliedLimit ||
              requirements.get(opponentId) !== limit
            ) {
              throw new Response('an allied entrant must choose one allied teammate and one solo opponent', { status: 409 })
            }
            allyIds = [allyId]
          }
          for (const entry of league.entries) {
            const rosterLimit = rosters.get(entry.userId)?.built?.limit
            if (rosterLimit !== entry.requiredLimit) throw new Response('a sealed roster does not match its assigned size', { status: 409 })
          }
        }
        if (league.format === '2v2') {
          const requiredLimit = alliedLeagueRosterLimit(limit)
          if (participantIds.some((playerId) => rosters.get(playerId)?.built?.limit !== requiredLimit))
            throw new Response('every doubles roster must use half the force size', { status: 409 })
        }

        const initialCommands: Command[] = [
          {
            kind: 'configure-battle',
            limit,
            missionPackId,
            terrainLayoutId: null,
            twistId: null,
            teamBattle: league.format === '2v1' || league.format === '2v2',
            playerCount: expectedPlayers,
            clockLimitMinutes: null,
          },
          { kind: 'attach-roster', playerId: userId, roster: ownRoster, prep: null, painted: true },
          { kind: 'attach-roster', playerId: opponentIds[0]!, roster: opponentRoster, prep: null, painted: true },
          ...participantIds
            .filter((playerId) => playerId !== userId && playerId !== opponentIds[0])
            .map((playerId) => ({ kind: 'attach-roster' as const, playerId, roster: rosters.get(playerId)!, prep: null, painted: true })),
          { kind: 'lock-league-rosters', leagueToken, eventToken: league.eventToken },
        ]
        return {
          allyIds,
          opponentIds,
          initialCommands,
          result: {
            token,
            format: league.format,
            requiredLimit:
              league.format === '2v2'
                ? alliedLeagueRosterLimit(limit)
                : (league.entries.find((entry) => entry.userId === userId)?.requiredLimit ?? limit),
            participantIds,
          },
        }
      },
    )
    if (!result) throw new Response('no such league', { status: 404 })
    this.events.publish(id, result.participantIds)
    return result
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
    rules?: Parameters<typeof missionFor>[0] | null,
    page?: { limit: number; before?: BattlesCursor; withUserId?: string },
  ) {
    const { battles: histories, nextCursor } = await this.repository.battlesByUser(userId, page)
    return { battles: this.battleSummaries(histories, userId, rules), nextCursor }
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
    rules?: Parameters<typeof missionFor>[0] | null,
    page?: { limit: number; before?: BattlesCursor },
  ) {
    const { battles: histories, nextCursor } = await this.repository.publicBattles({
      limit: page?.limit ?? PUBLIC_BATTLES_PAGE,
      before: page?.before,
      viewerId,
    })
    return { battles: this.battleSummaries(histories, viewerId, rules), nextCursor }
  }

  /** The battles this player's friends are in and they are not. */
  async friendBattles(userId: string, rules?: Parameters<typeof missionFor>[0] | null, page?: { limit: number; before?: BattlesCursor }) {
    const { battles: histories, nextCursor } = await this.repository.battlesByFriends(userId, {
      limit: page?.limit ?? PUBLIC_BATTLES_PAGE,
      before: page?.before,
    })
    return { battles: this.battleSummaries(histories, userId, rules), nextCursor }
  }

  /**
   * The standings, folded from the finished battles anyone may watch.
   *
   * One read of the battles answers every subject: the logs are the expensive
   * part, and players, factions and detachments are three groupings of the same
   * finished games rather than three questions to go and ask.
   *
   * Held for a minute rather than folded again for every visitor. A standing is
   * derived, so a copy of it that goes stale costs a reader a minute of accuracy
   * and nothing else — which is exactly the trade a battle screen may not make,
   * because a stale battle is a player acting on a board that has moved. It is
   * kept in the process rather than in Valkey for the same reason: losing it on a
   * restart costs one recomputation, so it does not need somewhere to survive.
   *
   * `factionNames` turns a catalogue id into the name a player would recognise.
   * It is passed in rather than reached for, the same as `rules`, because the
   * fold itself has no business knowing what a catalogue is.
   */
  async standings(factionNames?: ReadonlyMap<string, string>): Promise<StandingsAnswer> {
    const now = this.clock()
    const since = now - STANDINGS_WINDOW_MS
    if (this.standingsHeld && this.standingsHeld.until > now) return this.standingsHeld.answer
    const [histories, practice] = await Promise.all([
      this.repository.watchableBattlesSince(since, STANDINGS_BATTLE_LIMIT),
      this.repository.practiceOpponents(),
    ])
    const summaries = this.battleSummaries(histories, null, null)
    const exclude = practice.map((opponent) => opponent.id)
    const tables = Object.fromEntries(
      STANDING_SUBJECTS.map((subject) => [
        subject,
        standings(summaries, { exclude, subject }).map((row) =>
          subject === 'faction' ? { ...row, name: factionNames?.get(row.id) ?? row.name } : row,
        ),
      ]),
    ) as Record<StandingSubject, Standing[]>
    const answer = { ...tables, since }
    this.standingsHeld = { until: now + STANDINGS_HOLD_MS, answer }
    return answer
  }

  /** How widely this player's battles may be seen, and their own answer to it. */
  battleAudience(userId: string) {
    return this.repository.battleAudience(userId)
  }

  setBattleAudience(userId: string, audience: BattleAudience) {
    return this.repository.setBattleAudience(userId, audience, this.clock())
  }

  /**
   * Whether a viewer holding no seat may read this battle.
   *
   * `battleAudience` folds the seats' answers; a friend is only asked about when
   * the fold says the answer turns on one, so an ordinary public battle costs the
   * audience read alone.
   */
  private async mayWatch(history: BattleHistory, viewerId: string | null) {
    const audiences = await this.repository.battleAudiences(history.players.map((player) => player.id))
    const audience = battleAudience(history.players.map((player) => audiences.get(player.id)))
    if (!viewerId || audience !== 'friends') return maySpectate(audience, { signedIn: Boolean(viewerId), friend: false })
    const friends = sortedFriends(await this.repository.relationships(viewerId), viewerId).friends
    const friend = history.players.some((player) => friends.some((known) => known.id === player.id))
    return maySpectate(audience, { signedIn: true, friend })
  }

  async leagueBattles(
    leagueToken: string,
    eventToken: string,
    page: { limit: number; before?: BattlesCursor },
    rules?: Parameters<typeof missionFor>[0] | null,
  ) {
    const { battles: histories, nextCursor } = await this.repository.battlesByLeagueEvent(leagueToken, eventToken, page)
    return { battles: this.battleSummaries(histories, null, rules), nextCursor }
  }

  private battleSummaries(histories: readonly BattleHistory[], viewerId: string | null, rules?: Parameters<typeof missionFor>[0] | null) {
    return histories.map(({ battle, players, log }) => {
      const state = reduceBattle(
        players.map((player) => player.id),
        log,
        players.map((player) => player.side),
      )
      const viewerSide = state.players.find((player) => player.id === viewerId)?.side ?? 0
      const opposingSide = state.players.find((player) => player.side !== viewerSide)?.side
      const ownDisposition = sideDisposition(state, viewerSide)
      const opposingDisposition = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
      return {
        token: battle.token,
        createdAt: battle.createdAt,
        status: state.status,
        round: state.round,
        phase: state.phase,
        players: players.map((player) => player.name),
        playerIds: players.map((player) => player.id),
        sides: state.players.map((player) => player.side),
        armies: state.players.map((player) => player.roster?.name ?? null),
        // The catalogue the army came from, so a battle can also be counted as a
        // result for the faction that fielded it. A pasted list has none.
        factions: state.players.map((player) => player.roster?.built?.catalogueId ?? null),
        detachments: state.players.map((player) => player.roster?.built?.detachments?.map((detachment) => detachment.name) ?? []),
        // The painted bonus pays at the end of the battle, so a running score does not
        // carry it yet — and it is the side's one bonus, the same as everywhere else.
        // Onto the seat that already carries the side's score, because that is the seat
        // every reader of this list picks out to ask what a side finished on.
        scores: state.players.map(
          (player) =>
            player.primary +
            player.secondary +
            (state.status === 'finished' && player.id === sideCaptain(state, player.side).id ? sidePaintedPoints(state, player.side) : 0),
        ),
        mission: rules ? missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId) : null,
        deploymentId: state.deploymentId,
        settings: state.settings,
        result: state.result,
        lastActivity: log.at(-1)?.at ?? battle.createdAt,
      }
    })
  }

  /** Someone's name and picture, to a viewer allowed to see it. */
  async userProfile(viewerId: string | null, userId: string, battleToken?: string) {
    const profile = await this.repository.profileByUserId(userId)
    if (!profile) return null
    if (viewerId) {
      if (viewerId === userId) return profile
      const friends = sortedFriends(await this.repository.relationships(viewerId), viewerId).friends
      if (friends.some((friend) => friend.id === userId)) return profile
      if (await this.repository.shareBattle(viewerId, userId)) return profile
    }
    if (!battleToken) return null
    const screen = await this.screen(battleToken, viewerId)
    return screen.kind === 'spectator' && screen.view.players.some((player) => player.id === userId) ? profile : null
  }

  async saveRoster(
    userId: string,
    roster: {
      id?: string
      name: string
      catalogueId: string
      detachmentIds: readonly string[]
      disposition: string | null
      limit: number
      picks: readonly RosterPick[]
      prep: SavedPrep | null
      waivedRules?: readonly FormatRuleId[]
      optionalRules?: readonly OptionalRuleId[]
      borrowedDetachmentId?: string | null
      visibility: 'private' | 'unlisted'
      source: RosterSource
    },
  ) {
    const id = roster.id ?? randomId()
    const saved = await this.repository.saveRoster({
      ...roster,
      detachmentId: JSON.stringify(roster.detachmentIds),
      id,
      userId,
      picks: JSON.stringify(roster.picks),
      prep: roster.prep ? JSON.stringify(roster.prep) : null,
      tags: '[]',
      waivedRules: JSON.stringify(roster.waivedRules ?? []),
      optionalRules: JSON.stringify(roster.optionalRules ?? []),
      borrowedDetachmentId: roster.borrowedDetachmentId ?? null,
      now: this.clock(),
    })
    if (!saved) throw new Response('you do not own this roster', { status: 403 })
    return { id }
  }

  /** A user's own saved lists, newest first. Their picks come back parsed. */
  async savedRosters(userId: string) {
    const rows = await this.repository.rostersByUser(userId)
    return rows.map((row) => rosterFromRow(row, true))
  }

  async savedRosterSummaries(userId: string) {
    return (await this.repository.rosterSummariesByUser(userId)).map(({ detachmentId, waivedRules, optionalRules, ...row }) => ({
      ...row,
      detachmentIds: detachmentIds(detachmentId),
      waivedRules: waivedRulesFrom(waivedRules),
      optionalRules: optionalRulesFrom(optionalRules),
    }))
  }

  /**
   * An unlisted roster, its owner's private roster, or a list fielded in a battle the
   * reader is seated in.
   *
   * The last case widens nothing: a battle already shows every seat the opposing army
   * and its units, so the reader can see this list either way. The battle has to be
   * named, so the check stays one log rather than a scan of every battle they play.
   */
  async rosterAccess(id: string, userId: string | null = null, token: string | null = null) {
    const row = await this.repository.roster(id)
    if (!row) return null
    if (row.userId === userId) return { roster: rosterFromRow(row, true), editable: true }
    if (row.visibility === 'unlisted') return { roster: rosterFromRow(row), editable: false }
    if (!userId || !token) return null
    return (await this.fieldedIn(token, userId, id)) ? { roster: rosterFromRow(row), editable: false } : null
  }

  async sharedRoster(id: string, userId: string | null = null, token: string | null = null) {
    return (await this.rosterAccess(id, userId, token))?.roster ?? null
  }

  /** Whether a reader shares a battle with the list they are asking about. */
  private async fieldedIn(token: string, userId: string, rosterId: string) {
    const history = await this.repository.battleHistoryByToken(token)
    if (!history?.players.some((player) => player.id === userId)) return false
    return history.log.some((entry) => entry.command.kind === 'attach-roster' && entry.command.roster.id === rosterId)
  }

  async setRosterVisibility(userId: string, id: string, visibility: 'private' | 'unlisted') {
    if (!(await this.repository.setRosterVisibility(id, userId, visibility, this.clock()))) {
      throw new Response('you do not own this roster', { status: 403 })
    }
  }

  async deleteRoster(userId: string, id: string) {
    await this.repository.deleteRoster(id, userId)
  }

  /** The datasheets a user owns, as a set the picker can ask about directly. */
  async collection(userId: string) {
    const rows = await this.repository.collectionByUser(userId)
    return rows.map((row) => row.entryId)
  }

  async setOwned(userId: string, entryId: string, owned: boolean) {
    if (owned) await this.repository.addToCollection({ userId, entryId, now: this.clock() })
    else await this.repository.removeFromCollection(userId, entryId)
  }

  async favouriteFactions(userId: string) {
    const rows = await this.repository.favouriteFactionsByUser(userId)
    return rows.map((row) => row.catalogueId)
  }

  async setFavouriteFaction(userId: string, catalogueId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteFaction({ userId, catalogueId, now: this.clock() })
    else await this.repository.removeFavouriteFaction(userId, catalogueId)
  }

  async favouriteDetachments(userId: string) {
    const rows = await this.repository.favouriteDetachmentsByUser(userId)
    return rows.map(({ catalogueId, detachmentId }) => ({ catalogueId, detachmentId }))
  }

  async setFavouriteDetachment(userId: string, catalogueId: string, detachmentId: string, favourite: boolean) {
    if (favourite) await this.repository.addFavouriteDetachment({ userId, catalogueId, detachmentId, now: this.clock() })
    else await this.repository.removeFavouriteDetachment(userId, catalogueId, detachmentId)
  }

  /**
   * The players this one may open a battle with: their friends, and the practice
   * opponents the instance seats.
   *
   * One list rather than two, because `createBattle` asks exactly this question of
   * exactly this answer. Splitting them would put a second rule about who may be
   * in a battle next to the first, and the two would eventually disagree.
   *
   * Asked for on its own rather than taken out of the friends page, because the
   * page also offers strangers to invite — and reaching for that here put a scan
   * of every account on the instance behind every battle opened and every link
   * followed, to answer a question about a handful of rows.
   */
  async opponents(userId: string): Promise<{ id: string; name: string; image: string | null; automated: boolean }[]> {
    const [relationships, practice] = await Promise.all([this.repository.relationships(userId), this.repository.practiceOpponents()])
    return [
      ...sortedFriends(relationships, userId).friends.map((friend) => ({ ...friend, automated: false })),
      ...practice.map((opponent) => ({ ...opponent, automated: true })),
    ]
  }

  /**
   * Everyone this player is connected to, waiting on, or could ask.
   *
   * Two queries whatever the count: the relationships with the other party
   * already named, and the strangers, whom the database excludes rather than
   * this code filtering a fetched page down to whatever survives.
   */
  async friendships(userId: string) {
    const [relationships, people] = await Promise.all([this.repository.relationships(userId), this.repository.unrelatedUsers(userId)])
    return { ...sortedFriends(relationships, userId), people }
  }

  async requestFriend(userId: string, friendId: string) {
    if (friendId === userId || !(await this.repository.userById(friendId))) throw new Response('choose another player', { status: 400 })
    if (!(await this.repository.requestFriend(userId, friendId, this.clock())))
      throw new Response('a connection already exists', { status: 409 })
  }

  async acceptFriend(userId: string, requesterId: string) {
    if (!(await this.repository.acceptFriend(requesterId, userId, this.clock())))
      throw new Response('no such friend request', { status: 404 })
  }

  async removeFriend(userId: string, friendId: string) {
    if (!(await this.repository.removeFriend(userId, friendId))) throw new Response('no such friendship', { status: 404 })
  }

  /**
   * Opens a battle with its whole table already seated.
   *
   * The creator says which side each player is on: `allyId` sits beside them and
   * `opponentIds` face them. Everyone named is checked once, together — who may be
   * in a battle is one question, and asking it of the ally and the opponents
   * separately would be two rules about it. Every named player takes their seat in
   * the same transaction, so a battle is never a room with a chair free in it.
   */
  async createBattle(userId: string, input?: string | CreateBattleInput) {
    const settings = typeof input === 'object' && input.limit !== undefined ? { ...input, limit: input.limit } : null
    const { allyIds, opponentIds, invited } = newBattleSeats(input)
    if (!settings && (allyIds.length > 0 || opponentIds.length > 1)) {
      throw new Response('choose battle settings for a team battle', { status: 400 })
    }
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
    const token = randomToken()
    const id = randomId()
    await this.repository.createBattle({
      id,
      token,
      userId,
      allyIds,
      opponentIds,
      initialCommand: settings
        ? {
            kind: 'configure-battle',
            limit: settings.limit,
            missionPackId: settings.missionPackId,
            terrainLayoutId: null,
            twistId: null,
            teamBattle: invited.length >= 2,
            playerCount: (invited.length + 1) as 2 | 3 | 4,
            clockLimitMinutes: null,
          }
        : undefined,
      now: this.clock(),
    })
    // Everyone invited is told before they have the battle open, which is what puts
    // it on their list without a reload.
    this.events.publish(id, [userId, ...invited])
    return { token, practice }
  }

  async leagueBattleOptions(userId: string, input?: string | NewBattlePlayers) {
    const { allyIds, opponentIds, invited } = newBattleSeats(input)
    const participantIds = [userId, ...invited]
    if (!opponentIds.length || new Set(participantIds).size !== participantIds.length) return []
    const candidates = await this.repository.leagueBattleCandidates(userId, participantIds)
    const sideIds = [[userId, ...allyIds], opponentIds]
    return candidates
      .filter((candidate) => {
        const entries = new Map(candidate.entries.map((entry) => [entry.userId, entry]))
        const format = leagueTableShape(candidate.format)
        if (format === '1v1') {
          if (participantIds.length !== 2 || allyIds.length !== 0) return false
          if (candidate.format !== null) return true
          const limit = entries.get(userId)?.sealedLimit
          return (
            limit !== null &&
            limit !== undefined &&
            GAME_SIZES.some((size) => size.limit === limit) &&
            participantIds.every((id) => entries.get(id)?.sealedLimit === limit)
          )
        }
        if (candidate.format === '2v1' && candidate.rosterLimit !== null && participantIds.length === 3) {
          const alliedLimit = alliedLeagueRosterLimit(candidate.rosterLimit)
          const roles = sideIds.map((side) =>
            side
              .map((id) => entries.get(id)?.requiredLimit)
              .every((limit) => limit === (side.length === 1 ? candidate.rosterLimit : alliedLimit)),
          )
          return sideIds.some((side) => side.length === 1) && sideIds.some((side) => side.length === 2) && roles.every(Boolean)
        }
        if (candidate.format === '2v2' && participantIds.length === 4 && sideIds.every((side) => side.length === 2)) {
          const ownTeam = entries.get(userId)?.teamId
          const opposingTeam = entries.get(opponentIds[0]!)?.teamId
          return Boolean(
            ownTeam &&
            opposingTeam &&
            ownTeam !== opposingTeam &&
            sideIds[0]!.every((id) => entries.get(id)?.teamId === ownTeam) &&
            sideIds[1]!.every((id) => entries.get(id)?.teamId === opposingTeam),
          )
        }
        return false
      })
      .map(({ token, name, eventToken, eventNumber, format }) => ({
        token,
        name,
        eventToken,
        eventNumber,
        format: leagueTableShape(format),
      }))
  }

  async deleteBattle(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    if (!(await this.repository.deleteBattle(seats.battle.id, userId)))
      throw new Response('only the battle creator can delete it', { status: 403 })
    this.events.publish(
      seats.battle.id,
      seats.players.map((player) => player.id),
    )
  }

  /**
   * `rules` is passed in rather than reached for, so the service stays testable
   * without a synced dataset.
   */
  async screen(token: string, userId: string | null, rules?: Parameters<typeof missionFor>[0] | null): Promise<BattleScreen> {
    const history = await this.mustFind(token)
    const viewerId = userId && this.seated(history, userId) ? userId : SPECTATOR_ID
    const screen = this.battleScreen(history, viewerId, rules)
    if (viewerId !== SPECTATOR_ID) return screen
    const spectator = (): SpectatorScreen => ({
      kind: 'spectator',
      view: screen.view,
      missions: screen.missions,
      report: battleReport(
        history.players,
        history.log,
        history.players.map((player) => player.id),
        SPECTATOR_ID,
        history.players.map((player) => player.side),
      ),
    })
    if (screen.view.leagueToken) return spectator()
    // Everyone else either watches or is told no. Nobody arrives here to sit down:
    // the seats were filled when the battle was created.
    return (await this.mayWatch(history, userId)) ? spectator() : { kind: 'unavailable' }
  }

  /** A readable account of the battle. Derived from the log, so nothing is stored for it. */
  async report(token: string, userId: string) {
    const history = await this.mustFind(token)
    if (!this.seated(history, userId)) throw new Response('you are not in this battle', { status: 403 })
    return battleReport(
      history.players,
      history.log,
      history.players.map((player) => player.id),
      userId,
      history.players.map((player) => player.side),
    )
  }

  async submit(
    token: string,
    userId: string,
    expectedSeq: number,
    command: Command,
    rules?: Parameters<typeof missionFor>[0] | null,
  ): Promise<SubmitAnswer> {
    const seats = await this.mustSeat(token, userId)
    if (command.kind === 'lock-league-rosters') throw new Response('league roster locks are created by the server', { status: 403 })
    // The log comes back with the answer, so a refusal and a lost race both report
    // the state that refused them rather than the one the caller was holding —
    // and without a second read of a history the append had already in hand.
    const { result, log } = await this.repository.submit(
      { battleId: seats.battle.id, userId, expectedSeq, command, now: this.clock() },
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
    if (result.outcome === 'appended')
      this.events.publish(
        seats.battle.id,
        seats.players.map((player) => player.id),
        result.seq,
      )
    return { result, screen: this.battleScreen({ ...seats, log }, userId, rules) }
  }

  /** Opening a battle stream is an authorization decision. */
  async userBattleId(token: string, userId: string) {
    const seats = await this.mustSeat(token, userId)
    return seats.battle.id
  }

  /** The only place a visibility-filtered battle view is built. */
  private battleScreen(history: BattleHistory, userId: string, rules?: Parameters<typeof missionFor>[0] | null): SeatedScreen {
    const state = reduceBattle(
      history.players.map((player) => player.id),
      history.log,
      history.players.map((player) => player.side),
    )
    if (rules) hydrateAuthoritativeAwards(state, rules)
    const view = battleView(history.battle, history.players, state, userId, this.clock())
    const missionForSide = (side: number) => (rules ? resolvedMissionForSide(state, rules, side) : null)
    const viewerSide = view.players.find((player) => player.id === userId)?.side
    return {
      kind: 'battle',
      view,
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

function withAuthoritativeAwards<T extends Pick<Extract<Command, { kind: 'set-prep' }>, 'primary' | 'secondaries' | 'secondaryDeck'>>(
  prep: T,
  rules: NonNullable<Parameters<typeof missionFor>[0]>,
): T {
  const primaryByKey = new Map((rules.primaries ?? []).map((card) => [card.key, card]))
  const secondaryByKey = new Map((rules.secondaries ?? []).map((card) => [card.key, card]))
  return {
    ...prep,
    primary: prep.primary ? authoritativeCard(prep.primary, primaryByKey) : null,
    secondaries: prep.secondaries.map((secondary) => authoritativeCard(secondary, secondaryByKey)),
    secondaryDeck: prep.secondaryDeck?.map((secondary) => authoritativeCard(secondary, secondaryByKey)),
  }
}

type AvailableCard = { key: string; name: string; awards: MissionAward[] }

function authoritativeCard(submitted: Secondary, available: Map<string, AvailableCard>): Secondary {
  const authoritative = available.get(submitted.key)
  return authoritative
    ? { key: authoritative.key, name: authoritative.name, awards: authoritative.awards }
    : { key: submitted.key, name: submitted.name }
}

function hydrateAuthoritativeAwards(state: BattleState, rules: NonNullable<Parameters<typeof missionFor>[0]>) {
  const primaryByKey = new Map((rules.primaries ?? []).map((card) => [card.key, card]))
  const secondaryByKey = new Map((rules.secondaries ?? []).map((card) => [card.key, card]))
  const hydrate = (card: Secondary, available: Map<string, AvailableCard>) =>
    card.awards === undefined ? authoritativeCard(card, available) : card
  for (const player of state.players) {
    if (player.primaryCard) {
      const mission = state.status === 'setup' ? null : resolvedMissionForSide(state, rules, player.side)
      const primary = mission ? primaryByKey.get(mission.id) : null
      player.primaryCard = mission
        ? {
            key: mission.id,
            name: mission.name,
            awards: player.primaryCard.awards ?? primary?.awards,
          }
        : hydrate(player.primaryCard, primaryByKey)
    }
    player.secondaries = player.secondaries.map((secondary) => hydrate(secondary, secondaryByKey))
    player.secondaryDeck = player.secondaryDeck?.map((secondary) => hydrate(secondary, secondaryByKey)) ?? null
  }
}

function resolvedMissionForSide(state: BattleState, rules: NonNullable<Parameters<typeof missionFor>[0]>, side: number) {
  const ownDisposition = sideDisposition(state, side)
  const opposingSide = state.players.find((player) => player.side !== side)?.side
  const opposingDisposition = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
  return missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId)
}

/**
 * One player's relationships sorted into what the interface asks about: settled
 * friends, requests waiting on them, and requests they are waiting on.
 *
 * The only place that split is made, so `opponents` and the friends page cannot
 * disagree about who counts as a friend.
 */
function sortedFriends(relationships: Awaited<ReturnType<Repository['relationships']>>, userId: string) {
  const named = (row: (typeof relationships)[number]) => ({ id: row.otherId, name: row.otherName, image: row.otherImage })
  return {
    friends: relationships.filter((row) => row.acceptedAt !== null).map(named),
    incoming: relationships.filter((row) => row.acceptedAt === null && row.addresseeId === userId).map(named),
    outgoing: relationships.filter((row) => row.acceptedAt === null && row.requesterId === userId).map(named),
  }
}

function rosterFromRow(row: NonNullable<Awaited<ReturnType<Repository['roster']>>>, includePrep = false) {
  return {
    id: row.id,
    name: row.name,
    catalogueId: row.catalogueId,
    detachmentIds: detachmentIds(row.detachmentId),
    disposition: row.disposition,
    limit: row.limit,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    picks: picksSchema.parse(JSON.parse(row.picks)),
    prep: includePrep && row.prep ? savedPrepSchema.parse(JSON.parse(row.prep)) : null,
    waivedRules: waivedRulesFrom(row.waivedRules),
    optionalRules: optionalRulesFrom(row.optionalRules),
    borrowedDetachmentId: row.borrowedDetachmentId,
    visibility: row.visibility,
    source: row.source,
  }
}

function setupReferenceError(state: ReturnType<typeof reduceBattle>, rules: NonNullable<Parameters<typeof missionFor>[0]>): string | null {
  // A matchup is between the two sides, so it is read off each side's captain. Taking
  // the first two seats instead held while side 0 was always one player, and put a 2v1
  // whose pair opened the battle into a matchup between its own allies.
  const [one, two] = [...new Set(state.players.map((player) => player.side))]
    .toSorted((left, right) => left - right)
    .map((side) => sideDisposition(state, side))
  const missions = [
    missionFor(rules, one ?? null, two ?? null, state.settings.missionPackId),
    missionFor(rules, two ?? null, one ?? null, state.settings.missionPackId),
  ]
  if (one && two && state.settings.missionPackId && missions.some((mission) => !mission)) {
    return 'the selected mission pack does not contain this matchup'
  }
  const sides = [...new Set(state.players.map((player) => player.side))].toSorted((left, right) => left - right)
  const primaries = rules.primaries ?? []
  const expectedSecondaries = new Set((rules.secondaries ?? []).map((card) => card.key))
  const fixedSecondaries = new Set(
    (rules.secondaries ?? []).filter((card) => card.awards.some((award) => award.mode === 'fixed')).map((card) => card.key),
  )
  const prepared = missions.every((mission, index) => {
    if (!mission) return true
    if (!primaries.some((card) => card.key === mission.id) || expectedSecondaries.size === 0) return true
    const player = sideCaptain(state, sides[index]!)
    if (player.primaryCard?.key !== mission.id) return false
    if (player.secondaryMode === 'fixed') {
      return (
        player.secondaries.length === FIXED_SECONDARIES &&
        new Set(player.secondaries.map((card) => card.key)).size === FIXED_SECONDARIES &&
        player.secondaries.every((card) => fixedSecondaries.has(card.key)) &&
        completeDeck(player.secondaryDeck, expectedSecondaries)
      )
    }
    return completeDeck(player.secondaryDeck, expectedSecondaries)
  })
  if (!prepared) return 'every side must prepare its mission cards'
  const deploymentId = state.deploymentId
  if (!deploymentId) return 'choose a deployment'
  if (!rules.deployments.some((deployment) => deployment.id === deploymentId)) return 'that deployment is not available'
  if (missions.some((mission) => mission?.deploymentIds.length && !mission.deploymentIds.includes(deploymentId)))
    return 'that deployment does not match the mission'
  if (!state.settings.terrainLayoutId) return null
  const terrain = rules.terrainLayouts.find((layout) => layout.id === state.settings.terrainLayoutId)
  if (!terrain) return 'that terrain layout is not available'
  const matchups = one && two ? new Set([`${one}-vs-${two}`, `${two}-vs-${one}`]) : new Set<string>()
  if (matchups.size && !matchups.has(terrain.matchupId)) return 'that terrain layout does not match the armies'
  if (terrain.deploymentId && terrain.deploymentId !== state.deploymentId) return 'that terrain layout does not match the deployment'
  if (!terrain.geometry) return 'exact terrain data is not available yet'
  return null
}

function completeDeck(cards: { key: string }[] | null | undefined, expected: Set<string>): boolean {
  return cards?.length === expected.size && cards.every((card) => expected.has(card.key))
}

function repairPrepReferenceError(
  state: ReturnType<typeof reduceBattle>,
  by: PlayerId,
  command: Extract<Command, { kind: 'set-prep' }>,
  rules: NonNullable<Parameters<typeof missionFor>[0]>,
): string | null {
  const player = commandArmy(state, by, command)
  if (!player) return null
  const ownDisposition = sideDisposition(state, player.side)
  const opposingSide = state.players.find((candidate) => candidate.side !== player.side)?.side
  const opposingDisposition = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
  const mission = missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId)
  const expectedSecondaries = new Set((rules.secondaries ?? []).map((card) => card.key))
  const primaryExists = (rules.primaries ?? []).some((card) => card.key === mission?.id)
  if (
    !mission ||
    !primaryExists ||
    command.primary?.key !== mission.id ||
    !expectedSecondaries.size ||
    !completeDeck(command.secondaryDeck, expectedSecondaries)
  ) {
    return 'those mission cards do not match this battle'
  }
  return null
}

/**
 * The matched-play ceilings, refused rather than only shown as guidance.
 *
 * Only a score that raises the total is checked: a correction reducing one, or one
 * made without a resolvable mission, is never guessed at and always allowed through.
 */
function scoringCapError(
  state: ReturnType<typeof reduceBattle>,
  by: PlayerId,
  command: Extract<Command, { kind: 'score' } | { kind: 'score-secondary' } | { kind: 'score-settlement' }>,
  rules: NonNullable<Parameters<typeof missionFor>[0]>,
): string | null {
  const target = scoringTarget(state, by, command)
  if (!target) return null
  const deltas =
    command.kind === 'score-settlement'
      ? {
          primary: command.scores.filter((score) => score.category === 'primary').reduce((sum, score) => sum + score.delta, 0),
          secondary: command.scores.filter((score) => score.category === 'secondary').reduce((sum, score) => sum + score.delta, 0),
        }
      : {
          primary: command.kind === 'score' && command.category === 'primary' ? command.delta : 0,
          secondary:
            command.kind === 'score' && command.category === 'secondary'
              ? command.delta
              : command.kind === 'score-secondary'
                ? command.delta
                : 0,
        }
  const opposingSide = state.players.find((player) => player.side !== target.side)?.side
  const opponentDisposition = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
  const mission = missionFor(rules, target.disposition, opponentDisposition, state.settings.missionPackId)
  if (!mission) return null
  // The round the points land in, which for a settlement of a turn already ended is
  // the round that turn was in rather than the one now being played.
  const round = command.kind === 'score-settlement' ? (command.round ?? state.round) : state.round
  const named = round === state.round ? 'this round’s' : `battle round ${round}’s`
  // A fixed card carries a ceiling of its own for the whole battle, which the per-round
  // and per-battle secondary caps do not cover: a card paying per model destroyed would
  // otherwise bank as much as the battle's whole allowance on its own.
  const cardCap = mission.fixedSecondaryCap
  if (target.secondaryMode === 'fixed' && cardCap) {
    const byCard =
      command.kind === 'score-settlement'
        ? command.scores.flatMap((score) => (score.category === 'secondary' && score.delta > 0 ? [[score.key, score.delta] as const] : []))
        : command.kind === 'score-secondary' && command.delta > 0
          ? [[command.key, command.delta] as const]
          : []
    for (const [key, delta] of byCard) {
      if ((target.scored[key] ?? 0) + delta > cardCap) return `that would score past the ${cardCap} VP cap for one fixed secondary mission`
    }
  }
  for (const category of ['primary', 'secondary'] as const) {
    const delta = deltas[category]
    if (delta <= 0) continue
    const roundCap = category === 'primary' ? mission.roundCap : mission.secondaryRoundCap
    const gameCap = category === 'primary' ? mission.gameCap : mission.secondaryGameCap
    const roundSoFar = (category === 'primary' ? target.primaryByRound : target.secondaryByRound)[round - 1] ?? 0
    const gameSoFar = category === 'primary' ? target.primary : target.secondary
    const label = category === 'primary' ? 'primary mission' : 'secondary missions'
    if (roundCap !== null && roundSoFar + delta > roundCap) return `that would score past ${named} ${roundCap} VP cap for ${label}`
    if (gameCap !== null && gameSoFar + delta > gameCap) return `that would score past the battle’s ${gameCap} VP cap for ${label}`
  }
  return null
}

/** The legacy column held one id; new rows hold the ordered 11e purchase list. */
/**
 * The format rules a saved row says it has waived.
 *
 * Parsed rather than trusted: a rule id this build does not know would be a
 * restriction the roster believes is off while every check still enforces it, so an
 * unrecognised name is dropped and the rule goes on being played.
 */
function optionalRulesFrom(value: string | null): OptionalRuleId[] {
  if (!value) return []
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is OptionalRuleId => OPTIONAL_RULE_IDS.some((known) => known === id)) : []
}

function waivedRulesFrom(value: string | null): FormatRuleId[] {
  if (!value) return []
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is FormatRuleId => FORMAT_RULE_IDS.some((known) => known === id)) : []
}

function detachmentIds(value: string | null): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}
