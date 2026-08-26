import type { BattleEvents } from '../adapters/events'
import { randomId, randomToken } from 'ras-stack/auth'
import {
  battleCapacity,
  type Command,
  commandArmy,
  FIXED_SECONDARIES,
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
import { type BattleView, battleView } from '../core/battleView'
import { battleReport } from '../core/battleReport'
import type { RosterPick } from '../core/roster'
import type { RosterSource } from '../core/savedRoster'
import {
  alliedLeagueRosterLimit,
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
import type { BattleHistory, BattleSeats, BattlesCursor, JoinResult, Repository } from '../db/repository'
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

/** A link resolves to a seated screen, a revealed league spectator, or an invitation; reads never claim seats. */
type BattleScreen = SeatedScreen | SpectatorScreen | { kind: 'invitation'; free: boolean }

const SPECTATOR_ID = ''

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
    const format = input.format ?? '1v1'
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
    const format = rule.format ?? '1v1'
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
      throw new Response('each doubles team must select exactly one Warlord before reveal', { status: 409 })
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
    return (await this.repository.rosterSummariesByUser(userId)).map(({ detachmentId, ...row }) => ({
      ...row,
      detachmentIds: detachmentIds(detachmentId),
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
   * Opens a battle and invites the rest of the table.
   *
   * The creator says which side each invitation is for: `allyId` joins them and
   * `opponentIds` face them. Everyone invited is checked once, together — who may be in a battle
   * is one question, and asking it of the ally and the opponents separately would
   * be two rules about it.
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
    if (allyIds.length && !opponentIds.length) throw new Response('choose an opponent', { status: 400 })
    if (settings && !opponentIds.length) throw new Response('choose an opponent', { status: 400 })
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
        if ((candidate.format ?? '1v1') === '1v1') return participantIds.length === 2 && allyIds.length === 0
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
        format: format ?? '1v1',
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
   * Takes a seat behind a shared link.
   *
   * Only the seats are read here: whether there is a chair free is settled inside
   * the append, under the lock that stops two people taking the same one, so
   * reading the history out here as well would fold the same log twice to reach
   * the same answer.
   */
  async join(token: string, userId: string): Promise<JoinResult> {
    const seats = await this.repository.battleByToken(token)
    if (!seats) throw new Response('no such battle', { status: 404 })
    const opener = seats.players.find((player) => player.side === 0)
    if (!opener || !(await this.opponents(opener.id)).some((friend) => friend.id === userId)) {
      throw new Response('battle opponents must be friends', { status: 403 })
    }
    const result = await this.repository.join({ battleId: seats.battle.id, userId, now: this.clock() })
    if (result === 'joined') this.events.publish(seats.battle.id, [...seats.players.map((player) => player.id), userId])
    return result
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
    if (screen.view.leagueToken) {
      return {
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
      }
    }
    return { kind: 'invitation', free: history.players.length < battleCapacity(screen.view.settings) }
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
    const view = battleView(history.battle, history.players, state, userId, this.clock())
    const missionForSide = (side: number) => {
      const ownDisposition = sideDisposition(state, side)
      const opposingSide = state.players.find((player) => player.side !== side)?.side
      const opposingDisposition = opposingSide === undefined ? null : sideDisposition(state, opposingSide)
      return rules ? missionFor(rules, ownDisposition, opposingDisposition, state.settings.missionPackId) : null
    }
    if (state.status !== 'setup') {
      for (const player of view.players) {
        const primary = missionForSide(player.side)
        // Only when the rules answer. A matchup this instance cannot resolve — a log
        // from before both dispositions were required, or a pack no longer synced —
        // keeps the primary its own `set-prep` recorded rather than losing it.
        if (primary) player.primaryCard = { key: primary.id, name: primary.name }
      }
    }
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
  const prepared = missions.every((mission, index) => {
    if (!mission) return true
    if (!primaries.some((card) => card.key === mission.id) || expectedSecondaries.size === 0) return true
    const player = sideCaptain(state, sides[index]!)
    if (player.primaryCard?.key !== mission.id) return false
    if (player.secondaryMode === 'fixed') return player.secondaries.length === FIXED_SECONDARIES
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
function detachmentIds(value: string | null): string[] {
  if (!value) return []
  if (!value.startsWith('[')) return [value]
  const parsed: unknown = JSON.parse(value)
  return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
}
