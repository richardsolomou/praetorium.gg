import type { BattleEvents } from '../../adapters/events'
import { randomId, randomToken } from 'ras-stack/auth'
import { GAME_SIZES, type Command, type Roster } from '../../core/battle'
import { commandSchema, parseRosterSnapshot } from '../../core/commands'
import {
  alliedLeagueRosterLimit,
  leagueTableShape,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_MEMBER_MAX,
  LEAGUE_TEAM_ROSTER_LIMITS,
  readsAlliedLeagueRoster,
  visibleLeagueEntries,
  type LeagueAdmission,
  type LeagueEntryStatus,
  type LeagueVisibility,
} from '../../core/league'
import type { TableShape } from '../../core/tableShape'
import type { Repository } from '../../db/repository'
import { rosterFromRow } from '../rosterPersistence'

export class LeagueService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
    private readonly events: BattleEvents,
  ) {}

  async createLeague(
    ownerId: string,
    input: {
      name: string
      description: string
      visibility: LeagueVisibility
      admission: LeagueAdmission
      playerLimit: number | null
    },
  ) {
    const token = randomToken()
    const eventToken = randomToken()
    await this.repository.createLeague({
      id: randomId(),
      token,
      eventId: randomId(),
      eventToken,
      ownerId,
      ...input,
      recurring: true,
      format: '1v1',
      rosterLimit: LEAGUE_DEFAULT_ROSTER_LIMIT,
      now: this.clock(),
    })
    return { token, eventToken }
  }

  async updateLeagueEvent(token: string, ownerId: string, rule: { format?: TableShape; rosterLimit?: number }, eventToken?: string) {
    const format = leagueTableShape(rule.format)
    const rosterLimit = rule.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT
    if (format !== '1v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === rosterLimit)) {
      throw new Response(`choose a supported ${format} roster size`, { status: 400 })
    }
    const result = await this.repository.updateLeagueEvent(token, ownerId, { format, rosterLimit }, eventToken)
    if (result === 'updated') return { format, rosterLimit }
    if (result === 'missing') throw new Response('no such league event', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can change the event rules', { status: 403 })
    if (result === 'closed') throw new Response('the event rules cannot change after reveal', { status: 409 })
    if (result === 'sealed') throw new Response('the event rules cannot change once a roster is sealed', { status: 409 })
    throw new Response(
      format === '2v2' ? 'a 2v2 event needs an even number of at least four places' : 'a 2v1 event needs at least three places',
      { status: 409 },
    )
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

  /** Send one revealed list back to its owner so a mistake can be corrected in place. */
  async unsealLeagueRoster(token: string, ownerId: string, userId: string, eventToken?: string) {
    const result = await this.repository.unsealLeagueRoster(token, ownerId, userId, eventToken)
    if (result === 'unsealed') return
    if (result === 'forbidden') throw new Response('only the organizer can unseal a roster', { status: 403 })
    if (result === 'not-revealed') throw new Response('an entrant can swap their own roster until reveal', { status: 409 })
    throw new Response('no such revealed event roster', { status: 404 })
  }

  /**
   * One entrant's sealed list, from the newest event this reader may read it in.
   *
   * Reveal opens a snapshot to everyone who can open the league; before it, an ally reads
   * the list they will field a force beside, and nobody else does.
   */
  async leagueRoster(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const candidates = await this.repository.leagueRosters(token, userId, eventToken, readerId)
    const readable = candidates.find(
      (candidate) =>
        candidate.revealedAt !== null ||
        readsAlliedLeagueRoster(candidate.format, candidate.rosterLimit, candidate.reader, candidate.sealed),
    )
    if (!readable) return null
    return parseRosterSnapshot(readable.snapshot)
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
}
