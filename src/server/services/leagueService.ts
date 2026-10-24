import { buildLeagueBattle, LeagueBattleSetupError } from '../../shared/leagueBattle'
import { offlineContext, offlineIdentifier } from '../offlineContext'
import { randomId, randomToken } from 'ras-stack/auth'
import { type Roster } from '../../core/battle'
import { commandSchema, parseRosterSnapshot } from '../../core/commands'
import {
  offeredLeagueAllowances,
  leagueTableShape,
  LEAGUE_DEFAULT_ROSTER_LIMIT,
  LEAGUE_MEMBER_MAX,
  LEAGUE_TEAM_ROSTER_LIMITS,
  leagueWarlordRefusal,
  readsSealedLeagueRoster,
  isLeagueOrganizer,
  visibleLeagueEntries,
  type LeagueAdmission,
  type LeagueAllowance,
  type LeagueEntryStatus,
  type LeagueVisibility,
} from '../../core/league'
import type { TableShape } from '../../core/tableShape'
import type { RepositoryPort } from '../spacetimeRepository'
import type { BattleFaction } from '../../shared/battleSummary'
import type { Notifier } from '../pushNotifier'
import { rosterFromRow } from '../rosterPersistence'
import { rosterWithoutUnitNotes } from '../../core/unitNotes'

export class LeagueService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly notifier: Notifier,
  ) {}

  async createLeague(ownerId: string, input: LeagueDetails & EventRuleInput & { ownerPlays: boolean }) {
    const { format, rosterLimit, allowances, ...details } = input
    const token = offlineIdentifier('leagueToken', randomToken)
    const eventToken = offlineIdentifier('eventToken', randomToken)
    const result = await this.repository.createLeague({
      id: offlineIdentifier('leagueId', randomId),
      token,
      eventId: offlineIdentifier('eventId', randomId),
      eventToken,
      ownerId,
      ...details,
      ...eventRule({ format, rosterLimit, allowances }),
      recurring: true,
      now: this.clock(),
    })
    if (result === 'too-small') throw new Response(tooFewPlaces(leagueTableShape(format)), { status: 409 })
    return { token, eventToken }
  }

  /** Opens the event after a revealed one with the league's details as they should now stand, together or not at all. */
  async createLeagueEvent(token: string, ownerId: string, input: LeagueDetails & EventRuleInput & { ownerPlays: boolean }) {
    const { format, rosterLimit, allowances, ...details } = input
    const eventToken = offlineIdentifier('eventToken', randomToken)
    const rule = eventRule({ format, rosterLimit, allowances })
    const result = await this.repository.createLeagueEvent({
      id: offlineIdentifier('eventId', randomId),
      token: eventToken,
      leagueToken: token,
      ownerId,
      ...details,
      ...rule,
      now: this.clock(),
    })
    if (result === 'created') return { eventToken }
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'forbidden') throw new Response('only an organizer can start an event', { status: 403 })
    if (result === 'too-small') throw new Response(tooFewPlaces(rule.format), { status: 409 })
    throw new Response('reveal this event’s lists before starting another', { status: 409 })
  }

  /** Saves the league's details and, when given, the open event's rule, together or not at all. */
  async updateLeague(
    token: string,
    ownerId: string,
    input: LeagueDetails & { rule?: EventRuleInput & { format: TableShape; rosterLimit: number } },
  ) {
    const result = await this.repository.updateLeague(token, ownerId, { ...input, rule: input.rule && eventRule(input.rule) })
    if (typeof result === 'object') {
      if (result.admitted.length)
        this.notifier.notify([{ kind: 'league-entry-accepted', actorId: ownerId, recipientIds: result.admitted, leagueToken: token }])
      return { ruleChanged: result.ruleChanged }
    }
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can edit this league', { status: 403 })
    if (result === 'closed') throw new Response('the event’s rules cannot change after reveal', { status: 409 })
    if (result === 'sealed') throw new Response('the event’s rules cannot change once a list is sealed', { status: 409 })
    if (result === 'team-minimum') throw new Response('the open team event needs a supported number of places', { status: 409 })
    throw new Response('the player limit cannot be lower than the accepted entrant count', { status: 409 })
  }

  async deleteLeague(token: string, ownerId: string) {
    const result = await this.repository.deleteLeague(token, ownerId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    throw new Response('only the organizer can delete this league', { status: 403 })
  }

  /** Replaces who runs the league beside its owner, from the owner's friends. */
  async setLeagueAdmins(token: string, ownerId: string, userIds: readonly string[]) {
    const result = await this.repository.setLeagueAdmins(token, ownerId, userIds, this.clock())
    if (typeof result === 'object') return result
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'forbidden') throw new Response('only the league’s owner can choose its admins', { status: 403 })
    throw new Response('admins must be your friends', { status: 403 })
  }

  leagues(userId: string | null) {
    return this.repository.leaguesVisibleTo(userId)
  }

  outdatedLeagueEntriesForRoster(userId: string, rosterId: string) {
    return this.repository.outdatedLeagueEntriesForRoster(userId, rosterId)
  }

  /** `factions` names each revealed army as battle summaries do, including catalogues the current index no longer lists. */
  async league(token: string, viewerId: string | null, eventToken?: string, factions: readonly BattleFaction[] = []) {
    const league = await this.repository.leagueByToken(token, viewerId, eventToken)
    if (!league) return null
    const factionsById = new Map(factions.map((faction) => [faction.id, faction]))
    const organizer = isLeagueOrganizer(
      league,
      league.admins.map((admin) => admin.id),
      viewerId,
    )
    return {
      ...league,
      entries: visibleLeagueEntries(league.entries, organizer, viewerId).map((entry) => {
        const faction = entry.army?.catalogueId ? factionsById.get(entry.army.catalogueId) : undefined
        return { ...entry, armyFaction: faction ? { slug: faction.slug, displayName: faction.displayName, icon: faction.icon } : null }
      }),
    }
  }

  async joinLeague(token: string, userId: string, eventToken?: string) {
    const result = await this.repository.joinLeague(token, userId, this.clock(), LEAGUE_MEMBER_MAX, eventToken)
    if (typeof result === 'object') {
      this.notifier.notify([
        { kind: 'league-entry-requested', actorId: userId, recipientIds: result.organizerIds, leagueToken: token, eventToken },
      ])
      return result.status
    }
    if (result === 'missing') throw new Response('no such league', { status: 404 })
    if (result === 'closed') throw new Response('this event’s lists are already out', { status: 409 })
    if (result === 'full') throw new Response('this league is full', { status: 409 })
    return result
  }

  /** Enters the organizer's friends in the open event outright, as a battle seats friends without asking. */
  async addLeagueEntrants(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.addLeagueEntrants(token, ownerId, userIds, LEAGUE_MEMBER_MAX, this.clock(), eventToken)
    if (typeof result === 'object') {
      if (result.added.length)
        this.notifier.notify([{ kind: 'league-entry-added', actorId: ownerId, recipientIds: result.added, leagueToken: token, eventToken }])
      return { added: result.added.length }
    }
    if (result === 'missing') throw new Response('no such league event', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can add players', { status: 403 })
    if (result === 'closed') throw new Response('players cannot be added after reveal', { status: 409 })
    if (result === 'not-friends') throw new Response('you can only add your friends', { status: 403 })
    throw new Response('the league does not have enough places left', { status: 409 })
  }

  async moderateLeagueEntry(
    token: string,
    ownerId: string,
    userId: string,
    status: Extract<LeagueEntryStatus, 'accepted' | 'rejected'>,
    eventToken?: string,
  ) {
    const result = await this.repository.moderateLeagueEntry(token, ownerId, userId, status, LEAGUE_MEMBER_MAX, eventToken)
    if (result === 'admitted')
      this.notifier.notify([{ kind: 'league-entry-accepted', actorId: ownerId, recipientIds: [userId], leagueToken: token, eventToken }])
    if (typeof result === 'object') {
      const notices = []
      if (result.rejected)
        notices.push({ kind: 'league-entry-rejected' as const, actorId: ownerId, recipientIds: [userId], leagueToken: token, eventToken })
      if (result.resealIds.length)
        notices.push({
          kind: 'league-roster-reseal' as const,
          actorId: ownerId,
          recipientIds: result.resealIds,
          leagueToken: token,
          eventToken,
        })
      if (notices.length) this.notifier.notify(notices)
      return
    }
    if (result === 'admitted' || result === 'updated') return
    if (result === 'forbidden') throw new Response('only the organizer can change entrants', { status: 403 })
    if (result === 'closed') throw new Response('this event’s lists are already out', { status: 409 })
    if (result === 'full') throw new Response('this league is full', { status: 409 })
    throw new Response('no such event entrant', { status: 404 })
  }

  /** Accepts the chosen waiting requests, oldest first, until the event's places run out. */
  async admitLeagueEntries(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.admitLeagueEntries(token, ownerId, userIds, eventToken)
    if (typeof result === 'object') {
      if (result.admitted.length)
        this.notifier.notify([
          { kind: 'league-entry-accepted', actorId: ownerId, recipientIds: result.admitted, leagueToken: token, eventToken },
        ])
      return result
    }
    if (result === 'forbidden') throw new Response('only the organizer can change entrants', { status: 403 })
    if (result === 'closed') throw new Response('this event’s lists are already out', { status: 409 })
    throw new Response('no such league event', { status: 404 })
  }

  async assignLeagueRosterRequirement(token: string, ownerId: string, userId: string, requiredLimit: number, eventToken?: string) {
    const result = await this.repository.assignLeagueRosterRequirement(token, ownerId, userId, requiredLimit, eventToken)
    if (result === 'updated' || typeof result === 'object') {
      if (typeof result === 'object' && result.resealIds.length)
        this.notifier.notify([
          { kind: 'league-roster-reseal', actorId: ownerId, recipientIds: result.resealIds, leagueToken: token, eventToken },
        ])
      return { requiredLimit }
    }
    if (result === 'forbidden') throw new Response('only the organizer can assign roster sizes', { status: 403 })
    if (result === 'closed') throw new Response('roster sizes cannot change after reveal', { status: 409 })
    if (result === 'wrong-format') throw new Response('1v1 roster sizes are assigned automatically', { status: 409 })
    if (result === 'wrong-limit') throw new Response('choose a roster size configured for this event', { status: 400 })
    throw new Response('no such accepted event entrant', { status: 404 })
  }

  async assignLeagueTeam(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.assignLeagueTeam(token, ownerId, userIds, offlineIdentifier('teamId', randomId), eventToken)
    if (result === 'updated' || typeof result === 'object') {
      if (typeof result === 'object' && result.resealIds.length)
        this.notifier.notify([
          { kind: 'league-roster-reseal', actorId: ownerId, recipientIds: result.resealIds, leagueToken: token, eventToken },
        ])
      return { teamSize: userIds.length }
    }
    if (result === 'forbidden') throw new Response('only the organizer can assign teams', { status: 403 })
    if (result === 'closed') throw new Response('teams cannot change after reveal', { status: 409 })
    if (result === 'wrong-format') throw new Response('pairs are assigned only for 2v1 and 2v2 leagues', { status: 409 })
    throw new Response('choose accepted event entrants', { status: 404 })
  }

  async ownRoster(userId: string, rosterId: string) {
    const row = await this.repository.roster(rosterId)
    if (!row || row.userId !== userId) return null
    return rosterFromRow(row, true)
  }

  async submitLeagueRoster(
    token: string,
    userId: string,
    roster: { id: string; limit: number; pointsBudget?: number | null; updatedAt: number },
    snapshot: Roster,
    eventToken?: string,
  ) {
    if (roster.pointsBudget != null)
      throw new Response('leagues use their battle size’s standard points; remove the custom points budget first', { status: 409 })
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
    if (result.outcome === 'unassigned') throw new Response('wait for the organizer to give you a size or team', { status: 409 })
    if (result.outcome === 'disposition-dropped')
      throw new Response(
        'your team sealed a Force Disposition this list and your teammate’s no longer offer; choose a list that keeps it',
        {
          status: 409,
        },
      )
    if (result.outcome === 'wrong-limit') throw new Response('choose a roster built for your assigned size', { status: 409 })
    if (result.outcome === 'invalid-warlords') throw new Response(leagueWarlordRefusal(snapshot), { status: 409 })
    if (result.outcome === 'disallowed') throw new Response(result.message, { status: 409 })
    throw new Response('the roster could not be sealed; check your entry and roster, then try again', { status: 409 })
  }

  /** Records the one Force Disposition a fixed pair plays, before reveal shows them the other side. */
  async setLeagueTeamDisposition(token: string, userId: string, disposition: string, eventToken?: string) {
    const result = await this.repository.setLeagueTeamDisposition(token, userId, disposition, this.clock(), eventToken)
    if (result.outcome === 'chosen') return
    if (result.outcome === 'closed')
      throw new Response('the lists are already out, so your team’s Force Disposition is settled', { status: 409 })
    if (result.outcome === 'not-offered')
      throw new Response('choose a Force Disposition one of your team’s sealed lists offers, once both are sealed', { status: 409 })
    throw new Response('you are not on a team in this event', { status: 404 })
  }

  /** Records whose Warlord leads a fixed pair, before reveal shows them the other side. */
  async setLeagueTeamWarlord(token: string, userId: string, warlordId: string, eventToken?: string) {
    const result = await this.repository.setLeagueTeamWarlord(token, userId, warlordId, this.clock(), eventToken)
    if (result.outcome === 'chosen') return
    if (result.outcome === 'closed') throw new Response('the lists are already out, so your team’s Warlord is settled', { status: 409 })
    if (result.outcome === 'not-offered')
      throw new Response('choose a teammate whose sealed list names a Warlord, once both lists are sealed', { status: 409 })
    throw new Response('you are not on a team in this event', { status: 404 })
  }

  async revealLeague(token: string, ownerId: string, eventToken?: string) {
    const result = await this.repository.revealLeague(token, ownerId, this.clock(), eventToken)
    if (result.outcome === 'revealed') {
      this.notifier.notify([{ kind: 'league-revealed', actorId: ownerId, recipientIds: result.entrantIds, leagueToken: token, eventToken }])
      return
    }
    if (result.outcome === 'invalid-warlords')
      throw new Response('each league roster must select exactly one eligible Warlord before reveal', { status: 409 })
    throw new Response('wait for every accepted list and every pair’s Force Disposition and Warlord before reveal', { status: 409 })
  }

  /** Send one revealed list back to its owner so a mistake can be corrected in place. */
  async unsealLeagueRoster(token: string, ownerId: string, userId: string, eventToken?: string) {
    const result = await this.repository.unsealLeagueRoster(token, ownerId, userId, eventToken)
    if (result === 'unsealed') {
      this.notifier.notify([{ kind: 'league-roster-unsealed', actorId: ownerId, recipientIds: [userId], leagueToken: token, eventToken }])
      return
    }
    if (result === 'forbidden') throw new Response('only the organizer can unseal a roster', { status: 403 })
    if (result === 'not-revealed') throw new Response('an entrant can swap their own roster until reveal', { status: 409 })
    throw new Response('no such revealed event roster', { status: 404 })
  }

  /**
   * One entrant's sealed list, from the newest event this reader may read it in.
   *
   * Reveal opens a snapshot to everyone who can open the league; before it, only its owner and
   * an ally who will field a force beside it read it.
   */
  async leagueRoster(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const candidates = await this.repository.leagueRosters(token, userId, eventToken, readerId)
    const readable = candidates.find(
      (candidate) =>
        candidate.revealedAt !== null ||
        readsSealedLeagueRoster(candidate.format, candidate.rosterLimit, candidate.reader, candidate.sealed),
    )
    if (!readable) return null
    const { reminders: _reminders, remindersEnabled: _remindersEnabled, ...roster } = parseRosterSnapshot(readable.snapshot)
    return rosterWithoutUnitNotes(roster)
  }

  friendLeagueRosters(viewerId: string) {
    return this.repository.friendLeagueRosters(viewerId)
  }

  rosterSharing(token: string, eventToken: string, userId: string) {
    return this.repository.leagueRosterSharing(token, eventToken, userId)
  }

  async shareRoster(token: string, eventToken: string, userId: string, submittedAt: number, rosterId: string) {
    const result = await this.repository.updateLeagueRosterSharing({
      op: 'share-roster',
      token,
      eventToken,
      ownerId: userId,
      submittedAt,
      rosterId,
      now: this.clock(),
    })
    return rosterSharingResult(result)
  }

  async dismissRosterSharing(token: string, eventToken: string, userId: string) {
    return rosterSharingResult(
      await this.repository.updateLeagueRosterSharing({
        op: 'dismiss-roster-sharing',
        token,
        eventToken,
        ownerId: userId,
      }),
    )
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
    const token = offlineIdentifier('battleToken', randomToken)
    const id = offlineIdentifier('battleId', randomId)
    const result = await this.repository.createLeagueBattle(
      {
        id,
        token,
        leagueToken,
        eventToken,
        userId,
        userIds: [userId, ...invited],
        now: offlineContext.getStore()?.createdAt ?? this.clock(),
      },
      (league) => {
        try {
          return buildLeagueBattle(league, userId, leagueToken, opponentId, missionPackId, token, allyId, secondOpponentId)
        } catch (error) {
          if (error instanceof LeagueBattleSetupError) throw new Response(error.message, { status: error.status })
          throw error
        }
      },
    )
    if (!result) throw new Response('no such league', { status: 404 })
    this.notifier.notify([
      { kind: 'battle-created', actorId: userId, recipientIds: result.participantIds, battleToken: token, league: true },
    ])
    return { ...result, battleId: id }
  }
}

type LeagueDetails = {
  name: string
  description: string
  visibility: LeagueVisibility
  admission: LeagueAdmission
  playerLimit: number | null
}

type EventRuleInput = { format?: TableShape; rosterLimit?: number; allowances?: readonly LeagueAllowance[] }

/** Missing allowances stay missing, which an update reads as "leave them as they are". */
function eventRule(rule: EventRuleInput) {
  const format = leagueTableShape(rule.format)
  const rosterLimit = rule.rosterLimit ?? LEAGUE_DEFAULT_ROSTER_LIMIT
  if (format !== '1v1' && !LEAGUE_TEAM_ROSTER_LIMITS.some((limit) => limit === rosterLimit)) {
    throw new Response(`choose a supported ${format} roster size`, { status: 400 })
  }
  return { format, rosterLimit, allowances: rule.allowances && offeredLeagueAllowances(format, rosterLimit, rule.allowances) }
}

function tooFewPlaces(format: TableShape) {
  return format === '2v2' ? 'a 2v2 event needs an even number of at least four places' : 'a 2v1 event needs at least three places'
}

function rosterSharingResult(result: Awaited<ReturnType<RepositoryPort['updateLeagueRosterSharing']>>) {
  if (typeof result !== 'string') return result
  if (result === 'stale') throw new Response('Your roster changed. Check the sharing options and try again.', { status: 409 })
  throw new Response('Only your own submitted roster can be shared after reveal.', { status: 409 })
}
