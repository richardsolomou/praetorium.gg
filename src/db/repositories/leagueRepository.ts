import { and, asc, count, desc, eq, exists, inArray, isNotNull, ne, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Command, Roster } from '../../core/battle'
import { parseRosterSnapshot } from '../../core/commands'
import {
  alliedLeagueRosterLimit,
  requiredLeagueRosterLimit,
  type LeagueAdmission,
  type LeagueEntryStatus,
  type LeagueVisibility,
} from '../../core/league'
import type { TableShape } from '../../core/tableShape'
import type { PraetoriumDatabase } from '../connection'
import { leagueEventBattles, leagueEventEntries, leagueEvents, leagues, rosters, user } from '../schema'
import type {
  AssignLeagueRosterRequirementResult,
  AssignLeagueTeamResult,
  CreateLeagueEventResult,
  DeleteLeagueResult,
  JoinLeagueResult,
  LeagueBattleCandidate,
  MakeLeagueRecurringResult,
  ModerateLeagueResult,
  RevealLeagueResult,
  SubmitLeagueRosterResult,
  UnsealLeagueRosterResult,
  UpdateLeagueEventResult,
  UpdateLeagueResult,
} from '../repository'

type DatabaseTransaction = Parameters<Parameters<PraetoriumDatabase['transaction']>[0]>[0]
type InsertBattle = (
  tx: DatabaseTransaction,
  input: {
    id: string
    token: string
    userId: string
    allyIds?: string[]
    opponentIds?: string[]
    initialCommands?: Command[]
    now: number
  },
) => Promise<void>

const LEAGUE_BATTLE_CANDIDATE_MAX = 50
const LEAGUE_ROSTER_EVENT_CANDIDATES = 20

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

export class LeagueRepository {
  constructor(
    private readonly database: PraetoriumDatabase,
    private readonly insertBattle: InsertBattle,
  ) {}

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
      if (!event) return { outcome: 'missing' }
      const [entry] = await tx
        .select({
          status: leagueEventEntries.status,
          requiredLimit: leagueEventEntries.requiredLimit,
          teamId: leagueEventEntries.teamId,
          snapshot: leagueEventEntries.rosterSnapshot,
        })
        .from(leagueEventEntries)
        .where(and(eq(leagueEventEntries.eventId, event.id), eq(leagueEventEntries.userId, input.userId)))
        .limit(1)
        .for('update')
      if (!entry || entry.status !== 'accepted') return { outcome: 'missing' }
      // Reveal closes submission, so after it the absence of a snapshot is the whole
      // record that the organizer unsealed this entry and asked for another list.
      if (event.revealedAt !== null && entry.snapshot !== null) return { outcome: 'missing' }
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

  /**
   * Reopen submission for one revealed entrant.
   *
   * Reveal is still one-way for the event; clearing a single snapshot lets the
   * organizer send a mistaken list back without unrevealing everyone else's.
   */
  async unsealLeagueRoster(token: string, ownerId: string, userId: string, eventToken?: string): Promise<UnsealLeagueRosterResult> {
    return this.database.transaction(async (tx) => {
      const [league] = await tx
        .select({ id: leagues.id, ownerId: leagues.ownerId })
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
      if (event.revealedAt === null) return 'not-revealed'
      const cleared = await tx
        .update(leagueEventEntries)
        .set({ rosterId: null, rosterName: null, rosterSnapshot: null, submittedAt: null })
        .where(
          and(
            eq(leagueEventEntries.eventId, event.id),
            eq(leagueEventEntries.userId, userId),
            eq(leagueEventEntries.status, 'accepted'),
            isNotNull(leagueEventEntries.rosterSnapshot),
          ),
        )
        .returning({ userId: leagueEventEntries.userId })
      return cleared.length ? 'unsealed' : 'missing'
    })
  }

  /**
   * One entrant's sealed entries, newest event first, each with its event shape and the
   * reader's own entry in the same event beside it.
   *
   * Reveal is not a condition here, because before it an ally still reads the snapshot and
   * `readsAlliedLeagueRoster` is the one place that decides which reader that is. That is
   * also why this returns the candidates rather than one row: without a named event the
   * answer is the newest event this reader may read, which reveal alone no longer decides.
   */
  async leagueRosters(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const reader = alias(leagueEventEntries, 'reader_entry')
    const rows = await this.database
      .select({
        snapshot: leagueEventEntries.rosterSnapshot,
        requiredLimit: leagueEventEntries.requiredLimit,
        teamId: leagueEventEntries.teamId,
        format: leagueEvents.format,
        rosterLimit: leagueEvents.rosterLimit,
        revealedAt: leagueEvents.revealedAt,
        readerStatus: reader.status,
        readerRequiredLimit: reader.requiredLimit,
        readerTeamId: reader.teamId,
      })
      .from(leagueEventEntries)
      .innerJoin(leagueEvents, eq(leagueEvents.id, leagueEventEntries.eventId))
      .innerJoin(leagues, eq(leagues.id, leagueEvents.leagueId))
      .leftJoin(reader, and(eq(reader.eventId, leagueEventEntries.eventId), eq(reader.userId, readerId ?? '')))
      .where(
        and(
          eq(leagues.token, token),
          eventToken ? eq(leagueEvents.token, eventToken) : undefined,
          eq(leagueEventEntries.userId, userId),
          eq(leagueEventEntries.status, 'accepted'),
          isNotNull(leagueEventEntries.rosterSnapshot),
        ),
      )
      .orderBy(desc(leagueEvents.number))
      .limit(LEAGUE_ROSTER_EVENT_CANDIDATES)
    return rows.flatMap((row) =>
      row.snapshot === null
        ? []
        : [
            {
              snapshot: row.snapshot,
              format: row.format,
              rosterLimit: row.rosterLimit,
              revealedAt: row.revealedAt,
              sealed: { userId, status: 'accepted' as const, requiredLimit: row.requiredLimit, teamId: row.teamId },
              reader:
                readerId && row.readerStatus
                  ? { userId: readerId, status: row.readerStatus, requiredLimit: row.readerRequiredLimit, teamId: row.readerTeamId }
                  : null,
            },
          ],
    )
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
}
