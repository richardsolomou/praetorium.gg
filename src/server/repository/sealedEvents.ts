import type { Command } from '../../core/battle'
import { rosterSnapshotOrNull } from '../../core/commands'
import {
  sealedEventArmy,
  sealedEventTeams,
  requiredSealedEventRosterLimit,
  type SealedEventAdmission,
  type SealedEventAllowance,
  type SealedEventVisibility,
} from '../../core/sealedEvent'
import { TABLE_SHAPES, type TableShape } from '../../core/tableShape'
import { openPairing, type SealedEventBattleSetup } from '../../shared/sealedEventBattle'
import { z } from 'zod'
import type { SealedEventSide } from '../../contracts/schemas'
import { sealedEventRosterSharingSchema } from '../../contracts/sealedEventRosterSharing'
import type { SpacetimeOperator } from '../spacetimeOperator'
import { profileOf, RepositoryArea } from './area'

/** When an event is played and when its rosters must be sealed by, either unset. */
export type SealedEventSchedule = { playsAt: number | null; sealBy: number | null }

type Tournament = NonNullable<NonNullable<Awaited<ReturnType<SpacetimeOperator['sealedEventByToken']>>>['tournament']>

/** A tournament's own details; its host fields already address and date it, and each read names its admins its own way. */
function tournamentDetails({ token: _token, createdAt: _createdAt, adminIds: _adminIds, ...details }: Tournament) {
  return details
}

/** Tournaments, hidden-list games and the sealed events they hold. */
export class SealedEventRepository extends RepositoryArea {
  sealedEventNames(...args: Parameters<SpacetimeOperator['sealedEventNames']>) {
    return this.product.sealedEventNames(...args)
  }

  createTournament(input: {
    id: string
    token: string
    eventId: string
    eventToken: string
    ownerId: string
    name: string
    description: string
    visibility: SealedEventVisibility
    admission: SealedEventAdmission
    playerLimit: number | null
    format?: TableShape
    rosterLimit?: number
    allowances?: readonly SealedEventAllowance[]
    ownerPlays?: boolean
    rounds?: number | null
    pointsBudget?: number | null
    soloPoints?: number | null
    allyPoints?: number | null
    sharedPoints?: boolean
    schedule?: SealedEventSchedule
    now: number
  }) {
    return this.product.sealedEventCommand(
      { ...input, op: 'create', format: input.format ?? null, rosterLimit: input.rosterLimit ?? null },
      z.enum(['too-small', 'forbidden']).nullable(),
    )
  }

  createHiddenListGame(input: {
    eventId: string
    eventToken: string
    groupToken: string
    timeZone?: string
    ownerId: string
    format?: TableShape
    rosterLimit?: number
    allowances?: readonly SealedEventAllowance[]
    pointsBudget?: number | null
    soloPoints?: number | null
    allyPoints?: number | null
    sharedPoints?: boolean
    schedule?: SealedEventSchedule
    now: number
  }) {
    return this.product.sealedEventCommand(
      { ...input, op: 'create-hidden-list-game', format: input.format ?? null, rosterLimit: input.rosterLimit ?? null },
      z.literal('forbidden').nullable(),
    )
  }

  /** Saves what is given: a tournament's details, the event's rule and its schedule, together or not at all. */
  updateSealedEvent(
    token: string,
    ownerId: string,
    input: {
      details?: {
        name: string
        description: string
        visibility: SealedEventVisibility
        admission: SealedEventAdmission
        playerLimit: number | null
      }
      rule?: {
        format: TableShape
        rosterLimit: number
        allowances?: readonly SealedEventAllowance[]
        rounds?: number | null
        pointsBudget?: number | null
        soloPoints?: number | null
        allyPoints?: number | null
        sharedPoints?: boolean
      }
      schedule?: SealedEventSchedule
    },
  ) {
    return this.product.sealedEventCommand(
      { op: 'update', token, ownerId, ...input },
      z.union([
        z.object({ admitted: z.array(z.string()), ruleChanged: z.boolean() }),
        z.enum(['missing', 'forbidden', 'below-accepted', 'team-minimum', 'closed', 'sealed', 'misfit']),
      ]),
    )
  }

  pairSealedEventRound(input: { token: string; eventToken: string; ownerId: string; round: number; pairs: [string, string | null][] }) {
    return this.product.sealedEventCommand({ op: 'pair-round', ...input }, z.enum(['paired', 'not-ready', 'stale', 'missing', 'forbidden']))
  }

  checkInSealedEventEntrant(input: {
    token: string
    eventToken: string
    ownerId: string
    userId: string
    checkedIn: boolean
    now: number
  }) {
    return this.product.sealedEventCommand({ op: 'check-in', ...input }, z.enum(['ok', 'closed', 'missing', 'forbidden']))
  }

  dropSealedEventNoShows(input: { token: string; eventToken: string; ownerId: string; now: number }) {
    return this.product.sealedEventCommand({ op: 'drop-no-shows', ...input }, z.enum(['ok', 'closed', 'missing', 'forbidden']))
  }

  setSealedEventTiebreak(input: { token: string; eventToken: string; ownerId: string; scheduleFirst: boolean }) {
    return this.product.sealedEventCommand({ op: 'set-tiebreak', ...input }, z.enum(['set', 'closed', 'missing', 'forbidden']))
  }

  setSealedEventRoundTimer(input: { token: string; eventToken: string; ownerId: string; endsAt: number | null }) {
    return this.product.sealedEventCommand({ op: 'set-round-timer', ...input }, z.enum(['set', 'not-ready', 'missing', 'forbidden']))
  }

  swapSealedEventSeats(input: { token: string; eventToken: string; ownerId: string; players: [string, string] }) {
    return this.product.sealedEventCommand({ op: 'swap-seats', ...input }, z.enum(['swapped', 'stale', 'started', 'missing', 'forbidden']))
  }

  setSealedEventBattlefield(input: {
    token: string
    eventToken: string
    ownerId: string
    round: number
    table: number
    battlefield: { patternId: string; terrainLayoutId: string } | null
  }) {
    return this.product.sealedEventCommand(
      { op: 'set-battlefield', ...input },
      z.enum(['set', 'not-ready', 'stale', 'started', 'missing', 'forbidden']),
    )
  }

  /** Who sits at a table and what they sealed, for working out which battlefields it can play on. */
  async sealedEventTable(token: string, eventToken: string | undefined, round: number, table: number) {
    const record = await this.product.sealedEventByToken(token, eventToken)
    if (!record) return undefined
    const { event, pairings, entries, organizerIds, teams } = record
    const pairing = pairings.find((candidate) => candidate.round === round && candidate.table === table)
    const picks = new Map(teams.map((team) => [team.teamId, team.disposition]))
    const accepted = entries.filter((entry) => entry.status === 'accepted' && entry.rosterSnapshot !== null)
    const seated =
      event.rounds === null ? accepted : accepted.filter((entry) => entry.userId === pairing?.aId || entry.userId === pairing?.bId)
    return {
      eventToken: event.token,
      format: event.format,
      rosterLimit: event.rosterLimit,
      revealed: event.revealedAt !== null,
      organizerIds,
      players: seated.map((entry) => ({
        userId: entry.userId,
        teamId: entry.teamId,
        teamDisposition: (entry.teamId && picks.get(entry.teamId)) ?? null,
        snapshot: entry.rosterSnapshot!,
      })),
    }
  }

  deleteSealedEvent(token: string, ownerId: string) {
    return this.product.sealedEventCommand({ op: 'delete', token, ownerId }, z.enum(['deleted', 'missing', 'forbidden']))
  }

  setSealedEventAdmins(token: string, ownerId: string, userIds: readonly string[], now: number) {
    return this.product.sealedEventCommand(
      { op: 'set-admins', token, ownerId, userIds, now },
      z.union([z.object({ added: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'not-friends'])]),
    )
  }

  eventAddress(...args: Parameters<SpacetimeOperator['sealedEventAddress']>) {
    return this.product.sealedEventAddress(...args)
  }

  async sealedEventsVisibleTo(userId: string | null) {
    const rows = await this.product.sealedEventsVisibleTo(userId, 100)
    const owners = await this.accounts.profilesByIds(rows.flatMap((row) => (row.tournament ? [row.tournament.ownerId] : [])))
    return rows.map(({ kind, token, tournament, group, event, personal, joined, accepted, occupied, ownEntry, pastAt }) => {
      const owner = tournament && profileOf(owners, tournament.ownerId, 'Tournament owner')
      return {
        kind,
        token,
        tournament:
          tournament && owner
            ? {
                ...tournamentDetails(tournament),
                adminIds: tournament.adminIds,
                ownerName: owner.name,
                ownerImage: owner.image,
                ownerColour: owner.colour,
              }
            : null,
        group,
        personal,
        eventToken: event.token,
        createdAt: event.createdAt,
        format: event.format,
        rosterLimit: event.rosterLimit,
        revealedAt: event.revealedAt,
        pointsBudget: event.pointsBudget,
        soloPoints: event.soloPoints,
        allyPoints: event.allyPoints,
        sharedPoints: event.sharedPoints,
        playsAt: event.playsAt,
        sealBy: event.sealBy,
        entrantCount: accepted,
        currentEntrantCount: joined,
        occupiedCount: occupied,
        pastAt,
        ownEntry: ownEntry
          ? {
              status: ownEntry.status,
              submitted: ownEntry.rosterSnapshot !== null,
              rosterName: ownEntry.rosterName,
              requiredLimit: requiredSealedEventRosterLimit(event.format, event.rosterLimit, ownEntry.requiredLimit, ownEntry.teamId),
            }
          : null,
      }
    })
  }

  outdatedSealedEventEntriesForRoster(userId: string, rosterId: string) {
    return this.product.outdatedSealedEventEntriesForRoster(userId, rosterId)
  }

  async friendSealedEventRosters(viewerId: string) {
    const rows = await this.product.friendSealedEventRosters(viewerId)
    const owners = await this.accounts.profilesByIds(rows.map((row) => row.userId))
    return rows.flatMap(({ hostToken, hostName, ...rest }) => {
      const owner = owners.get(rest.userId)
      return owner
        ? [
            {
              ...rest,
              sealedEventToken: hostToken,
              sealedEventName: hostName,
              ownerName: owner.name,
              ownerImage: owner.image,
              ownerColour: owner.colour,
            },
          ]
        : []
    })
  }

  async sealedEventBattleCandidates(userId: string, participantIds: readonly string[]) {
    const rows = await this.product.sealedEventBattleCandidates(userId, participantIds)
    return rows.map(({ token, name, event, entries }) => ({
      token,
      name,
      eventToken: event.token,
      format: event.format,
      rosterLimit: event.rosterLimit,
      entries: entries.map((entry) => ({
        userId: entry.userId,
        requiredLimit: entry.requiredLimit,
        sealedLimit: event.format === null ? this.frozenRosterLimit(entry.rosterSnapshot) : null,
        teamId: entry.teamId,
      })),
    }))
  }

  private frozenRosterLimit(snapshot: string | null) {
    return rosterSnapshotOrNull(snapshot)?.built?.limit ?? null
  }

  async sealedEventByToken(token: string, viewerId: string | null = null, eventToken?: string) {
    const record = await this.product.sealedEventByToken(token, eventToken)
    if (!record) return undefined
    const { kind, tournament, group, event, organizerIds, entries, teams, teamWarlords, pairings } = record
    const profiles = await this.accounts.profilesByIds([
      ...(tournament ? [tournament.ownerId, ...tournament.adminIds] : []),
      ...entries.map((entry) => entry.userId),
      ...(event.revealedBy ? [event.revealedBy] : []),
    ])
    const revealed = event.revealedAt !== null
    // Only a revealed list or a pair's choice needs the snapshot itself.
    const rosters = new Map(
      entries.map((entry) => [entry.userId, revealed || entry.teamId ? rosterSnapshotOrNull(entry.rosterSnapshot) : null]),
    )
    const pairs = sealedEventTeams(
      entries.map((entry) => ({ ...entry, roster: rosters.get(entry.userId) ?? null })),
      new Map(teams.map((team) => [team.teamId, team.disposition])),
      new Map(teamWarlords.map((team) => [team.teamId, team.userId])),
    )
    const owner = tournament && profileOf(profiles, tournament.ownerId, 'Tournament owner')
    return {
      kind,
      token: record.token,
      eventToken: event.token,
      createdAt: event.createdAt,
      tournament:
        tournament && owner
          ? {
              ...tournamentDetails(tournament),
              ownerName: owner.name,
              ownerImage: owner.image,
              ownerColour: owner.colour,
              admins: tournament.adminIds.flatMap((id) => {
                const admin = profiles.get(id)
                return admin ? [{ id, name: admin.name, image: admin.image, colour: admin.colour }] : []
              }),
            }
          : null,
      group,
      organizerIds,
      format: event.format,
      rosterLimit: event.rosterLimit,
      allowances: event.allowances,
      revealedAt: event.revealedAt,
      revealedByName: event.revealedBy ? (profiles.get(event.revealedBy)?.name ?? null) : null,
      rounds: event.rounds,
      pointsBudget: event.pointsBudget,
      soloPoints: event.soloPoints,
      allyPoints: event.allyPoints,
      sharedPoints: event.sharedPoints,
      playsAt: event.playsAt,
      sealBy: event.sealBy,
      remindedAt: event.remindedAt,
      roundEndsAt: event.roundEndsAt,
      scheduleFirst: event.scheduleFirst,
      pairings,
      battlefields: record.battlefields,
      occupiedCount: entries.filter((entry) => entry.status !== 'rejected').length,
      entries: entries.map((entry) => {
        const profile = profileOf(profiles, entry.userId, 'Entrant')
        const roster = rosters.get(entry.userId) ?? null
        const pair = pairs.find((candidate) => candidate.userIds.includes(entry.userId))
        return {
          userId: entry.userId,
          name: profile.name,
          image: profile.image,
          colour: profile.colour,
          status: entry.status,
          joinedAt: entry.joinedAt,
          submitted: entry.rosterSnapshot !== null,
          dropped: entry.droppedAt != null,
          checkedIn: entry.checkedInAt != null,
          rosterName: revealed || viewerId === entry.userId ? entry.rosterName : null,
          army: revealed && roster ? sealedEventArmy(roster) : null,
          sealedAt: revealed ? entry.submittedAt : null,
          teamId: entry.teamId,
          requiredLimit: requiredSealedEventRosterLimit(event.format, event.rosterLimit, entry.requiredLimit, entry.teamId),
          sealedLimit: event.format === null && revealed ? (roster?.built?.limit ?? null) : null,
          dispositionOwed: pair?.owed ?? false,
          warlordOwed: pair?.warlordOwed ?? false,
          // What the pair's lists offer is part of those lists, so only the pair reads it before the reveal.
          team:
            pair && (revealed || (viewerId !== null && pair.userIds.includes(viewerId)))
              ? { choices: pair.choices, disposition: pair.disposition, warlordChoices: pair.warlordChoices, warlord: pair.warlord }
              : null,
        }
      }),
    }
  }

  joinSealedEvent(token: string, userId: string, now: number, memberLimit: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'join', token, userId, now, memberLimit, eventToken: eventToken ?? '' },
      z.union([
        z.object({ status: z.literal('pending'), organizerIds: z.array(z.string()) }),
        z.enum(['pending', 'accepted', 'rejected', 'missing', 'closed', 'full', 'members-only']),
      ]),
    )
  }

  moderateSealedEventEntry(
    token: string,
    ownerId: string,
    userId: string,
    status: 'accepted' | 'rejected',
    memberLimit: number,
    eventToken?: string,
  ) {
    return this.product.sealedEventCommand(
      { op: 'moderate', token, ownerId, userId, status, memberLimit, eventToken: eventToken ?? '' },
      z.union([
        z.object({ rejected: z.boolean(), resealIds: z.array(z.string()) }),
        z.enum(['admitted', 'updated', 'missing', 'forbidden', 'closed', 'full']),
      ]),
    )
  }

  addSealedEventEntrants(
    token: string,
    ownerId: string,
    userIds: readonly string[],
    memberLimit: number,
    now: number,
    eventToken?: string,
  ) {
    return this.product.sealedEventCommand(
      { op: 'add', token, ownerId, userIds, memberLimit, now, eventToken: eventToken ?? '' },
      z.union([z.object({ added: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'closed', 'not-friends', 'not-members', 'full'])]),
    )
  }

  admitSealedEventEntries(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'admit', token, ownerId, userIds, eventToken: eventToken ?? '' },
      z.union([z.object({ admitted: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'closed'])]),
    )
  }

  assignSealedEventRosterRequirement(token: string, ownerId: string, userId: string, requiredLimit: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'assign-limit', token, ownerId, userId, requiredLimit, eventToken: eventToken ?? '' },
      z.union([z.object({ resealIds: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'closed', 'wrong-format', 'wrong-limit'])]),
    )
  }

  assignSealedEventTeam(token: string, ownerId: string, userIds: readonly string[], teamId: string, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'assign-team', token, ownerId, userIds, teamId, eventToken: eventToken ?? '' },
      z.union([z.object({ resealIds: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'closed', 'wrong-format'])]),
    )
  }

  chooseSealedEventSide(token: string, ownerId: string, side: SealedEventSide | null, now: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'set-side', token, ownerId, side, now, eventToken: eventToken ?? '' },
      z.enum(['updated', 'missing', 'forbidden', 'closed', 'wrong-format', 'full', 'members-only']),
    )
  }

  submitSealedEventRoster(input: {
    token: string
    userId: string
    rosterId: string
    rosterName: string
    rosterLimit?: number
    rosterUpdatedAt: number
    snapshot: string
    now: number
    eventToken?: string
  }) {
    return this.product.sealedEventCommand(
      { ...input, op: 'submit', ownerId: input.userId, eventToken: input.eventToken ?? '', rosterLimit: input.rosterLimit ?? null },
      z.union([
        z.object({
          outcome: z.literal('sealed'),
          format: z.enum(TABLE_SHAPES).nullable(),
          requiredLimit: z.number().nullable(),
        }),
        z.object({ outcome: z.enum(['missing', 'unassigned', 'wrong-limit', 'past-deadline']) }),
        z.object({ outcome: z.literal('invalid-warlords'), format: z.enum(TABLE_SHAPES).nullable() }),
        z.object({ outcome: z.literal('disposition-dropped'), disposition: z.string() }),
        z.object({ outcome: z.literal('disallowed'), message: z.string() }),
        z.object({ outcome: z.literal('wrong-budget'), pointsBudget: z.number() }),
        z.object({ outcome: z.literal('over-points'), points: z.number() }),
        z.object({ outcome: z.literal('ally-mismatch'), pointsBudget: z.number() }),
      ]),
    )
  }

  setSealedEventTeamDisposition(token: string, ownerId: string, disposition: string, now: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'set-team-disposition', token, ownerId, disposition, now, eventToken: eventToken ?? '' },
      z.union([z.object({ outcome: z.literal('chosen') }), z.object({ outcome: z.enum(['missing', 'closed', 'not-offered']) })]),
    )
  }

  setSealedEventTeamWarlord(token: string, ownerId: string, userId: string, now: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'set-team-warlord', token, ownerId, userId, now, eventToken: eventToken ?? '' },
      z.union([z.object({ outcome: z.literal('chosen') }), z.object({ outcome: z.enum(['missing', 'closed', 'not-offered']) })]),
    )
  }

  revealSealedEvent(token: string, ownerId: string, now: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'reveal', token, ownerId, now, eventToken: eventToken ?? '' },
      z.union([
        z.object({ outcome: z.literal('revealed'), entrantIds: z.array(z.string()) }),
        z.object({ outcome: z.literal('not-ready') }),
        z.object({ outcome: z.literal('invalid-warlords'), format: z.enum(TABLE_SHAPES) }),
      ]),
    )
  }

  remindSealedEvent(token: string, ownerId: string, now: number, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'remind', token, ownerId, now, eventToken: eventToken ?? '' },
      z.union([
        z.object({ outcome: z.literal('reminded'), recipientIds: z.array(z.string()) }),
        z.object({ outcome: z.literal('too-soon'), remindedAt: z.number() }),
        z.object({ outcome: z.literal('nobody') }),
        z.enum(['missing', 'forbidden']),
      ]),
    )
  }

  unsealSealedEventRoster(token: string, ownerId: string, userId: string, eventToken?: string) {
    return this.product.sealedEventCommand(
      { op: 'unseal', token, ownerId, userId, eventToken: eventToken ?? '' },
      z.enum(['unsealed', 'missing', 'forbidden', 'not-revealed']),
    )
  }

  dropSealedEventEntrant(input: { token: string; eventToken: string; ownerId: string; userId: string; now: number }) {
    return this.product.sealedEventCommand({ op: 'drop', ...input }, z.enum(['dropped', 'missing', 'forbidden', 'closed']))
  }

  async sealedEventRoster(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const row = await this.product.sealedEventRosters(token, userId, eventToken, readerId)
    if (!row) return null
    const { event, entry, reader } = row
    return {
      snapshot: entry.rosterSnapshot!,
      format: event.format,
      rosterLimit: event.rosterLimit,
      revealedAt: event.revealedAt,
      sealed: { userId, status: 'accepted' as const, requiredLimit: entry.requiredLimit, teamId: entry.teamId },
      reader:
        reader && readerId
          ? {
              userId: readerId,
              status: reader.status,
              requiredLimit: reader.requiredLimit,
              teamId: reader.teamId,
            }
          : null,
    }
  }

  /** Every accepted entrant's sealed list in one read, with whether the event has revealed them. */
  async sealedRosters(token: string, eventToken?: string) {
    const record = await this.product.sealedEventByToken(token, eventToken)
    if (!record) return null
    return {
      revealedAt: record.event.revealedAt,
      rosters: record.entries.flatMap((entry) =>
        entry.status === 'accepted' && entry.rosterSnapshot !== null ? [{ userId: entry.userId, snapshot: entry.rosterSnapshot }] : [],
      ),
    }
  }

  sealedEventRosterSharing(token: string, eventToken: string | undefined, userId: string) {
    return this.product.sealedEventRosterSharing(token, eventToken ?? '', userId)
  }

  updateSealedEventRosterSharing(
    input: {
      token: string
      eventToken: string | undefined
      ownerId: string
    } & ({ op: 'share-roster'; submittedAt: number; now: number; rosterId: string } | { op: 'dismiss-roster-sharing' }),
  ) {
    return this.product.sealedEventCommand(
      { ...input, eventToken: input.eventToken ?? '' },
      z.union([sealedEventRosterSharingSchema, z.enum(['missing', 'forbidden', 'unavailable', 'stale'])]),
    )
  }

  async createSealedEventBattle<T>(
    input: { id: string; token: string; sealedEventToken: string; eventToken?: string; userId: string; userIds: string[]; now: number },
    prepare: (
      sealedEvent: SealedEventBattleSetup,
    ) =>
      | { allyIds: string[]; opponentIds: string[]; initialCommands: Command[]; result: T }
      | Promise<{ allyIds: string[]; opponentIds: string[]; initialCommands: Command[]; result: T }>,
  ): Promise<T | undefined> {
    const record = await this.product.sealedEventByToken(input.sealedEventToken, input.eventToken)
    if (!record) return undefined
    const { event } = record
    const picks = new Map(record.teams.map((team) => [team.teamId, team.disposition]))
    const warlords = new Map(record.teamWarlords.map((team) => [team.teamId, team.userId]))
    const entries = record.entries.filter(
      (entry) =>
        entry.status === 'accepted' &&
        entry.rosterSnapshot !== null &&
        (event.format === '2v2' || event.format === '2v1' || input.userIds.includes(entry.userId)),
    )
    const pairing = openPairing(record.pairings, input.userId, input.userIds[1])
    const prepared = await prepare({
      token: record.token,
      eventToken: event.token,
      format: event.format,
      rosterLimit: event.rosterLimit,
      soloPoints: event.soloPoints,
      allyPoints: event.allyPoints,
      sharedPoints: event.sharedPoints,
      revealedAt: event.revealedAt,
      rounds: event.rounds,
      paired: Boolean(pairing),
      battlefield:
        record.battlefields.find(({ round, table }) => round === (pairing?.round ?? 0) && table === (pairing?.table ?? 0)) ?? null,
      entries: entries.map((entry) => ({
        userId: entry.userId,
        requiredLimit: entry.requiredLimit,
        snapshot: entry.rosterSnapshot,
        teamId: entry.teamId,
        teamDisposition: (entry.teamId && picks.get(entry.teamId)) ?? null,
        teamWarlord: (entry.teamId && warlords.get(entry.teamId)) ?? null,
      })),
    })
    const created = await this.product.sealedEventCommand(
      {
        op: 'create-battle',
        token: record.token,
        ownerId: input.userId,
        eventToken: event.token,
        id: input.id,
        battleToken: input.token,
        userId: input.userId,
        allyIds: prepared.allyIds,
        opponentIds: prepared.opponentIds,
        initialCommands: prepared.initialCommands,
        now: input.now,
        expectedEntries: entries.map((entry) => ({ userId: entry.userId, snapshot: entry.rosterSnapshot! })),
        ...(pairing ? { pairingKey: pairing.key } : {}),
      },
      z.boolean(),
    )
    return created ? prepared.result : undefined
  }
}
