import { buildSealedEventBattle, SealedEventBattleSetupError } from '../../shared/sealedEventBattle'
import { offlineContext, offlineIdentifier } from '../offlineContext'
import { byId } from '../../core/collections'
import type { Notice } from '../../core/notifications'
import { randomId, randomToken } from 'ras-stack/auth'
import { pointsBudgetError, pointsLabel, type Roster } from '../../core/battle'
import { commandSchema, parseRosterSnapshot, rosterSnapshotOrNull } from '../../core/commands'
import {
  sealedEventArmyPointsError,
  offeredSealedEventAllowances,
  sealedEventTableShape,
  SEALED_EVENT_DEFAULT_ROSTER_LIMIT,
  SEALED_EVENT_MEMBER_MAX,
  SEALED_EVENT_TEAM_ROSTER_LIMITS,
  sealedEventWarlordRefusal,
  readsSealedRoster,
  visibleSealedEventEntries,
  type SealedEventAdmission,
  type SealedEventAllowance,
  type SealedEventEntryStatus,
  type SealedEventVisibility,
} from '../../core/sealedEvent'
import type { TableShape } from '../../core/tableShape'
import type { SealedEventSide } from '../../contracts/schemas'
import type { SealedEventSchedule, RepositoryPort } from '../spacetimeRepository'
import type { BattleFaction } from '../../shared/battleSummary'
import type { Notifier } from '../pushNotifier'
import { rosterFromRow } from '../rosterPersistence'
import { rosterWithoutUnitNotes } from '../../core/unitNotes'

export class SealedEventService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly notifier: Notifier,
  ) {}

  async createTournament(
    ownerId: string,
    input: TournamentDetails & EventRuleInput & { ownerPlays: boolean; schedule?: SealedEventSchedule },
  ) {
    const { format, rosterLimit, allowances, rounds, pointsBudget, soloPoints, allyPoints, sharedPoints, ...details } = input
    const token = offlineIdentifier('leagueToken', randomToken)
    const eventToken = offlineIdentifier('eventToken', randomToken)
    const rule = eventRule({ format, rosterLimit, allowances, rounds, pointsBudget, soloPoints, allyPoints, sharedPoints })
    const result = await this.repository.createTournament({
      id: offlineIdentifier('leagueId', randomId),
      token,
      eventId: offlineIdentifier('eventId', randomId),
      eventToken,
      ownerId,
      ...details,
      ...rule,
      now: this.clock(),
    })
    if (result === 'too-small') throw new Response(tooFewPlaces(rule.format), { status: 409 })
    if (result === 'forbidden') throw new Response('name the tournament', { status: 400 })
    return { token, eventToken }
  }

  /** Starts a hidden-list game in a group its creator helps run; its address is its event's token. */
  async createHiddenListGame(
    ownerId: string,
    {
      groupToken,
      schedule,
      timeZone,
      ...input
    }: Omit<EventRuleInput, 'rounds'> & {
      groupToken: string
      timeZone?: string
      schedule?: SealedEventSchedule
    },
  ) {
    const token = randomToken()
    const result = await this.repository.createHiddenListGame({
      eventId: randomId(),
      eventToken: token,
      groupToken,
      ownerId,
      schedule,
      timeZone,
      ...eventRule(input),
      now: this.clock(),
    })
    if (result === 'forbidden') throw new Response('only the group’s organizers can start its hidden-list games', { status: 403 })
    return { token }
  }

  /** Saves a tournament's details when given, and the event's rule and schedule, together or not at all. */
  async updateSealedEvent(
    token: string,
    ownerId: string,
    input: {
      details?: TournamentDetails
      rule?: EventRuleInput & { format: TableShape; rosterLimit: number }
      schedule?: SealedEventSchedule
    },
  ) {
    const result = await this.repository.updateSealedEvent(token, ownerId, { ...input, rule: input.rule && eventRule(input.rule) })
    if (typeof result === 'object') {
      this.notifySealedEvent('sealed-event-entry-accepted', ownerId, result.admitted, token)
      return { ruleChanged: result.ruleChanged }
    }
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can edit this event', { status: 403 })
    if (result === 'closed') throw new Response('the event’s rules cannot change after reveal', { status: 409 })
    if (result === 'sealed') throw new Response('the event’s format and size cannot change once a list is sealed', { status: 409 })
    if (result === 'misfit')
      throw new Response('a sealed list would no longer fit; ask its player to reseal, or keep the current rules', { status: 409 })
    if (result === 'team-minimum') throw new Response('the open team event needs a supported number of places', { status: 409 })
    throw new Response('the player limit cannot be lower than the accepted entrant count', { status: 409 })
  }

  async deleteSealedEvent(token: string, ownerId: string) {
    const result = await this.repository.deleteSealedEvent(token, ownerId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    throw new Response('only the organizer can delete this event', { status: 403 })
  }

  /** Replaces who runs a tournament beside its owner, from the owner's friends. */
  async setSealedEventAdmins(token: string, ownerId: string, userIds: readonly string[]) {
    const result = await this.repository.setSealedEventAdmins(token, ownerId, userIds, this.clock())
    if (typeof result === 'object') return result
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    if (result === 'forbidden') throw new Response('only a tournament’s owner can choose its admins', { status: 403 })
    throw new Response('admins must be your friends', { status: 403 })
  }

  sealedEvents(userId: string | null) {
    return this.repository.sealedEventsVisibleTo(userId)
  }

  eventAddress(token: string, eventToken?: string) {
    return this.repository.eventAddress(token, eventToken)
  }

  outdatedSealedEventEntriesForRoster(userId: string, rosterId: string) {
    return this.repository.outdatedSealedEventEntriesForRoster(userId, rosterId)
  }

  /** `factions` names each revealed army as battle summaries do, including catalogues the current index no longer lists. */
  async sealedEvent(token: string, viewerId: string | null, eventToken?: string, factions: readonly BattleFaction[] = []) {
    const record = await this.repository.sealedEventByToken(token, viewerId, eventToken)
    if (!record) return null
    const { organizerIds, ...sealedEvent } = record
    const factionsById = byId(factions)
    const organizer = viewerId !== null && organizerIds.includes(viewerId)
    return {
      ...sealedEvent,
      organizer,
      entries: visibleSealedEventEntries(sealedEvent.entries, organizer, viewerId).map((entry) => {
        const faction = entry.army?.catalogueId ? factionsById.get(entry.army.catalogueId) : undefined
        return { ...entry, armyFaction: faction ? { slug: faction.slug, displayName: faction.displayName, icon: faction.icon } : null }
      }),
    }
  }

  async joinSealedEvent(token: string, userId: string, eventToken?: string) {
    const result = await this.repository.joinSealedEvent(token, userId, this.clock(), SEALED_EVENT_MEMBER_MAX, eventToken)
    if (typeof result === 'object') {
      this.notifySealedEvent('sealed-event-entry-requested', userId, result.organizerIds, token, eventToken)
      return result.status
    }
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    if (result === 'closed')
      throw new Response('this event is closed to new players: its rosters are out or past their deadline', { status: 409 })
    if (result === 'full') throw new Response('this event is full', { status: 409 })
    if (result === 'members-only') throw new Response('only the group’s members can play its hidden-list games', { status: 403 })
    return result
  }

  /** Enters players outright, as a battle seats friends without asking: a tournament's organizer's friends, or a group game's members. */
  async addSealedEventEntrants(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.addSealedEventEntrants(token, ownerId, userIds, SEALED_EVENT_MEMBER_MAX, this.clock(), eventToken)
    if (typeof result === 'object') {
      this.notifySealedEvent('sealed-event-entry-added', ownerId, result.added, token, eventToken)
      return { added: result.added.length }
    }
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can add players', { status: 403 })
    if (result === 'closed') throw new Response('players cannot be added after reveal', { status: 409 })
    if (result === 'not-friends') throw new Response('you can only add your friends', { status: 403 })
    if (result === 'not-members') throw new Response('you can only add the group’s members', { status: 403 })
    throw new Response('there are not enough places left', { status: 409 })
  }

  async moderateSealedEventEntry(
    token: string,
    ownerId: string,
    userId: string,
    status: Extract<SealedEventEntryStatus, 'accepted' | 'rejected'>,
    eventToken?: string,
  ) {
    const result = await this.repository.moderateSealedEventEntry(token, ownerId, userId, status, SEALED_EVENT_MEMBER_MAX, eventToken)
    if (result === 'admitted') this.notifySealedEvent('sealed-event-entry-accepted', ownerId, [userId], token, eventToken)
    if (typeof result === 'object') {
      const notices = []
      if (result.rejected)
        notices.push({
          kind: 'sealed-event-entry-rejected' as const,
          actorId: ownerId,
          recipientIds: [userId],
          sealedEventToken: token,
          eventToken,
        })
      if (result.resealIds.length)
        notices.push({
          kind: 'sealed-event-roster-reseal' as const,
          actorId: ownerId,
          recipientIds: result.resealIds,
          sealedEventToken: token,
          eventToken,
        })
      if (notices.length) this.notifier.notify(notices)
      return
    }
    if (result === 'admitted' || result === 'updated') return
    if (result === 'forbidden') throw new Response('only the organizer can change entrants', { status: 403 })
    if (result === 'closed') throw new Response('this event’s lists are already out', { status: 409 })
    if (result === 'full') throw new Response('this event is full', { status: 409 })
    throw new Response('no such event entrant', { status: 404 })
  }

  /** Accepts the chosen waiting requests, oldest first, until the event's places run out. */
  async admitSealedEventEntries(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.admitSealedEventEntries(token, ownerId, userIds, eventToken)
    if (typeof result === 'object') {
      this.notifySealedEvent('sealed-event-entry-accepted', ownerId, result.admitted, token, eventToken)
      return result
    }
    if (result === 'forbidden') throw new Response('only the organizer can change entrants', { status: 403 })
    if (result === 'closed') throw new Response('this event’s lists are already out', { status: 409 })
    throw new Response('no such event', { status: 404 })
  }

  async assignSealedEventRosterRequirement(token: string, ownerId: string, userId: string, requiredLimit: number, eventToken?: string) {
    const result = await this.repository.assignSealedEventRosterRequirement(token, ownerId, userId, requiredLimit, eventToken)
    if (result === 'updated' || typeof result === 'object') {
      if (typeof result === 'object') this.notifySealedEvent('sealed-event-roster-reseal', ownerId, result.resealIds, token, eventToken)
      return { requiredLimit }
    }
    if (result === 'forbidden') throw new Response('only the organizer can assign roster sizes', { status: 403 })
    if (result === 'closed') throw new Response('roster sizes cannot change after reveal', { status: 409 })
    if (result === 'wrong-format') throw new Response('1v1 roster sizes are assigned automatically', { status: 409 })
    if (result === 'wrong-limit') throw new Response('choose a roster size configured for this event', { status: 400 })
    throw new Response('no such accepted event entrant', { status: 404 })
  }

  async assignSealedEventTeam(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    const result = await this.repository.assignSealedEventTeam(token, ownerId, userIds, offlineIdentifier('teamId', randomId), eventToken)
    if (result === 'updated' || typeof result === 'object') {
      if (typeof result === 'object') this.notifySealedEvent('sealed-event-roster-reseal', ownerId, result.resealIds, token, eventToken)
      return { teamSize: userIds.length }
    }
    if (result === 'forbidden') throw new Response('only the organizer can assign teams', { status: 403 })
    if (result === 'closed') throw new Response('teams cannot change after reveal', { status: 409 })
    if (result === 'wrong-format') throw new Response('pairs are assigned only for 2v1 and 2v2 events', { status: 409 })
    throw new Response('choose accepted event entrants', { status: 404 })
  }

  async chooseSealedEventSide(token: string, userId: string, side: SealedEventSide | null, eventToken?: string) {
    const result = await this.repository.chooseSealedEventSide(token, userId, side, this.clock(), eventToken)
    if (result === 'updated') return { side }
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    if (result === 'forbidden') throw new Response('only a group’s players choose their own side', { status: 403 })
    if (result === 'closed') throw new Response('sides cannot change once the lists are out or past their deadline', { status: 409 })
    if (result === 'wrong-format') throw new Response('choose a side this game plays', { status: 400 })
    if (result === 'full') throw new Response('that side is full', { status: 409 })
    throw new Response('only the group’s members can play its hidden-list games', { status: 403 })
  }

  async ownRoster(userId: string, rosterId: string) {
    const row = await this.repository.roster(rosterId)
    if (!row || row.userId !== userId) return null
    return rosterFromRow(row, true)
  }

  async submitSealedEventRoster(
    token: string,
    userId: string,
    roster: { id: string; limit: number; updatedAt: number },
    snapshot: Roster,
    eventToken?: string,
  ) {
    const command = commandSchema.parse({ kind: 'attach-roster', roster: snapshot })
    if (command.kind !== 'attach-roster') throw new Error('expected a roster snapshot')
    const { id: _savedRosterId, ...sealed } = command.roster
    const result = await this.repository.submitSealedEventRoster({
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
    if (result.outcome === 'wrong-limit')
      throw new Response('choose a roster built for this event’s battle size; a team event takes smaller ones too', { status: 409 })
    if (result.outcome === 'invalid-warlords') throw new Response(sealedEventWarlordRefusal(snapshot), { status: 409 })
    if (result.outcome === 'disallowed') throw new Response(result.message, { status: 409 })
    if (result.outcome === 'past-deadline') throw new Response('the roster deadline has passed', { status: 409 })
    if (result.outcome === 'wrong-budget')
      throw new Response(`choose a roster built to this event’s ${result.pointsBudget.toLocaleString('en')} points`, { status: 409 })
    if (result.outcome === 'over-points')
      throw new Response(`choose a roster that spends at most ${result.points.toLocaleString('en')} points`, { status: 409 })
    if (result.outcome === 'ally-mismatch')
      throw new Response(`your ally sealed a list saved to ${pointsLabel(result.pointsBudget)}; choose one saved to the same total`, {
        status: 409,
      })
    throw new Response('the roster could not be sealed; check your entry and roster, then try again', { status: 409 })
  }

  /** Records the one Force Disposition a fixed pair plays, before reveal shows them the other side. */
  async setSealedEventTeamDisposition(token: string, userId: string, disposition: string, eventToken?: string) {
    const result = await this.repository.setSealedEventTeamDisposition(token, userId, disposition, this.clock(), eventToken)
    if (result.outcome === 'chosen') return
    if (result.outcome === 'closed')
      throw new Response('the lists are already out, so your team’s Force Disposition is settled', { status: 409 })
    if (result.outcome === 'not-offered')
      throw new Response('choose a Force Disposition one of your team’s sealed lists offers, once both are sealed', { status: 409 })
    throw new Response('you are not on a team in this event', { status: 404 })
  }

  /** Records whose Warlord leads a fixed pair, before reveal shows them the other side. */
  async setSealedEventTeamWarlord(token: string, userId: string, warlordId: string, eventToken?: string) {
    const result = await this.repository.setSealedEventTeamWarlord(token, userId, warlordId, this.clock(), eventToken)
    if (result.outcome === 'chosen') return
    if (result.outcome === 'closed') throw new Response('the lists are already out, so your team’s Warlord is settled', { status: 409 })
    if (result.outcome === 'not-offered')
      throw new Response('choose a teammate whose sealed list names a Warlord, once both lists are sealed', { status: 409 })
    throw new Response('you are not on a team in this event', { status: 404 })
  }

  async revealSealedEvent(token: string, ownerId: string, eventToken?: string) {
    const result = await this.repository.revealSealedEvent(token, ownerId, this.clock(), eventToken)
    if (result.outcome === 'revealed') {
      this.notifySealedEvent('sealed-event-revealed', ownerId, result.entrantIds, token, eventToken)
      return
    }
    if (result.outcome === 'invalid-warlords')
      throw new Response('each sealed roster must select exactly one eligible Warlord before reveal', { status: 409 })
    throw new Response('wait for every accepted list and every pair’s Force Disposition and Warlord before reveal', { status: 409 })
  }

  /** Nudges the accepted entrants still without a sealed list, at most once per cooldown; it reveals and changes nothing else. */
  async remindSealedEventEntrants(token: string, ownerId: string, eventToken?: string) {
    const result = await this.repository.remindSealedEvent(token, ownerId, this.clock(), eventToken)
    if (typeof result === 'object' && result.outcome === 'reminded') {
      this.notifySealedEvent('sealed-event-roster-reminder', ownerId, result.recipientIds, token, eventToken)
      return { reminded: result.recipientIds.length }
    }
    if (result === 'missing') throw new Response('no such event', { status: 404 })
    if (result === 'forbidden') throw new Response('only the organizer can remind entrants', { status: 403 })
    if (result.outcome === 'too-soon') throw new Response('the entrants were reminded recently, so try again later', { status: 409 })
    throw new Response('nobody is waiting to seal a list', { status: 409 })
  }

  /** Send one revealed list back to its owner so a mistake can be corrected in place. */
  async unsealSealedEventRoster(token: string, ownerId: string, userId: string, eventToken?: string) {
    const result = await this.repository.unsealSealedEventRoster(token, ownerId, userId, eventToken)
    if (result === 'unsealed') {
      this.notifySealedEvent('sealed-event-roster-unsealed', ownerId, [userId], token, eventToken)
      return
    }
    if (result === 'forbidden') throw new Response('only the organizer can unseal a roster', { status: 403 })
    if (result === 'not-revealed') throw new Response('an entrant can swap their own roster until reveal', { status: 409 })
    throw new Response('no such revealed event roster', { status: 404 })
  }

  /** Takes a revealed Swiss entrant out of every later round: themselves, or anyone when an organizer asks. */
  async dropSealedEventEntrant(token: string, eventToken: string, ownerId: string, userId: string) {
    const result = await this.repository.dropSealedEventEntrant({ token, eventToken, ownerId, userId, now: this.clock() })
    if (result === 'dropped') return
    if (result === 'forbidden') throw new Response('only the organizer can drop another player', { status: 403 })
    if (result === 'closed') throw new Response('players drop out of Swiss rounds once the rosters are out', { status: 409 })
    throw new Response('no such player in this event', { status: 404 })
  }

  /**
   * One entrant's sealed list, where this reader may read it.
   *
   * Reveal opens a snapshot to everyone who can open the event; before it, only its owner and
   * an ally who will field a force beside it read it.
   */
  async sealedEventRoster(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const sealed = await this.repository.sealedEventRoster(token, userId, eventToken, readerId)
    if (!sealed || (sealed.revealedAt === null && !readsSealedRoster(sealed.format, sealed.rosterLimit, sealed.reader, sealed.sealed)))
      return null
    return readableSealedRoster(parseRosterSnapshot(sealed.snapshot))
  }

  /** Every revealed list as `sealedEventRoster` gives one to any reader of the event; nothing before the reveal, whoever asks. */
  async revealedSealedEventRosters(token: string, eventToken?: string) {
    const sealed = await this.repository.sealedRosters(token, eventToken)
    if (!sealed || sealed.revealedAt === null) return []
    // An unreadable list stays in as null, so the bundle says so rather than leaving its player out.
    return sealed.rosters.map(({ userId, snapshot }) => {
      const roster = rosterSnapshotOrNull(snapshot)
      return { userId, roster: roster && readableSealedRoster(roster) }
    })
  }

  friendSealedEventRosters(viewerId: string) {
    return this.repository.friendSealedEventRosters(viewerId)
  }

  rosterSharing(token: string, eventToken: string | undefined, userId: string) {
    return this.repository.sealedEventRosterSharing(token, eventToken, userId)
  }

  async shareRoster(token: string, eventToken: string | undefined, userId: string, submittedAt: number, rosterId: string) {
    const result = await this.repository.updateSealedEventRosterSharing({
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

  async dismissRosterSharing(token: string, eventToken: string | undefined, userId: string) {
    return rosterSharingResult(
      await this.repository.updateSealedEventRosterSharing({
        op: 'dismiss-roster-sharing',
        token,
        eventToken,
        ownerId: userId,
      }),
    )
  }

  async createSealedEventBattle(
    userId: string,
    sealedEventToken: string,
    opponentId: string,
    missionPackId: string | null,
    eventToken?: string,
    allyId?: string,
    secondOpponentId?: string,
    fieldAlerts: (roster: Roster, playerId: string) => Promise<Roster> = async (roster) => roster,
  ) {
    const invited = [opponentId, allyId, secondOpponentId].filter((id): id is string => Boolean(id))
    if (new Set([userId, ...invited]).size !== invited.length + 1) throw new Response('choose different entrants', { status: 400 })
    const token = offlineIdentifier('battleToken', randomToken)
    const id = offlineIdentifier('battleId', randomId)
    const result = await this.repository.createSealedEventBattle(
      {
        id,
        token,
        sealedEventToken,
        eventToken,
        userId,
        userIds: [userId, ...invited],
        now: offlineContext.getStore()?.createdAt ?? this.clock(),
      },
      async (sealedEvent) => {
        let prepared
        try {
          prepared = buildSealedEventBattle(sealedEvent, userId, opponentId, missionPackId, token, allyId, secondOpponentId)
        } catch (error) {
          if (error instanceof SealedEventBattleSetupError) throw new Response(error.message, { status: error.status })
          throw error
        }
        const initialCommands = await Promise.all(
          prepared.initialCommands.map(async (command) =>
            command.kind === 'attach-roster'
              ? { ...command, roster: await fieldAlerts(command.roster, command.playerId ?? userId) }
              : command,
          ),
        )
        return { ...prepared, initialCommands }
      },
    )
    if (!result) throw new Response('no such event', { status: 404 })
    this.notifier.notify([
      { kind: 'battle-created', actorId: userId, recipientIds: result.participantIds, battleToken: token, sealedEvent: true },
    ])
    return { ...result, battleId: id }
  }

  /** Nobody to tell sends nothing. */
  private notifySealedEvent(
    kind: SealedEventNoticeKind,
    actorId: string,
    recipientIds: readonly string[],
    sealedEventToken: string,
    eventToken?: string,
  ) {
    if (recipientIds.length) this.notifier.notify([{ kind, actorId, recipientIds, sealedEventToken, eventToken }])
  }
}

type SealedEventNoticeKind = Exclude<Extract<Notice, { sealedEventToken: string }>, { round: number }>['kind']

type TournamentDetails = {
  name: string
  description: string
  visibility: SealedEventVisibility
  admission: SealedEventAdmission
  playerLimit: number | null
}

type EventRuleInput = {
  format?: TableShape
  rosterLimit?: number
  allowances?: readonly SealedEventAllowance[]
  rounds?: number | null
  pointsBudget?: number | null
  soloPoints?: number | null
  allyPoints?: number | null
  sharedPoints?: boolean
}

/** Missing allowances stay missing, which an update reads as "leave them as they are". */
function eventRule(rule: EventRuleInput) {
  const format = sealedEventTableShape(rule.format)
  const rosterLimit = rule.rosterLimit ?? SEALED_EVENT_DEFAULT_ROSTER_LIMIT
  if (format !== '1v1' && !SEALED_EVENT_TEAM_ROSTER_LIMITS.some((limit) => limit === rosterLimit)) {
    throw new Response(`choose a supported ${format} roster size`, { status: 400 })
  }
  if (rule.rounds != null && format !== '1v1') throw new Response('Swiss rounds pair duels only', { status: 400 })
  const pointsBudgetProblem =
    rule.pointsBudget == null
      ? null
      : format !== '1v1'
        ? 'only a duel takes its own points total'
        : pointsBudgetError(rosterLimit, rule.pointsBudget)
  if (pointsBudgetProblem) throw new Response(pointsBudgetProblem, { status: 400 })
  const armyPointsProblem = sealedEventArmyPointsError(format, rule)
  if (armyPointsProblem) throw new Response(armyPointsProblem, { status: 400 })
  return {
    format,
    rosterLimit,
    allowances: rule.allowances && offeredSealedEventAllowances(format, rosterLimit, rule.allowances),
    rounds: rule.rounds,
    pointsBudget: rule.pointsBudget,
    soloPoints: rule.soloPoints,
    allyPoints: rule.allyPoints,
    sharedPoints: rule.sharedPoints,
  }
}

function tooFewPlaces(format: TableShape) {
  return format === '2v2' ? 'a 2v2 event needs an even number of at least four places' : 'a 2v1 event needs at least three places'
}

function rosterSharingResult(result: Awaited<ReturnType<RepositoryPort['updateSealedEventRosterSharing']>>) {
  if (typeof result !== 'string') return result
  if (result === 'stale') throw new Response('Your roster changed. Check the sharing options and try again.', { status: 409 })
  throw new Response('Only your own submitted roster can be shared after reveal.', { status: 409 })
}

/** A sealed list as anyone but its owner reads it: without the owner's reminders or unit notes. */
function readableSealedRoster({ reminders: _reminders, remindersEnabled: _remindersEnabled, ...roster }: Roster) {
  return rosterWithoutUnitNotes(roster)
}
