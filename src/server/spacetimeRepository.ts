import { isAdminUserCountSort, type AdminUser, type AdminUserCountSort, type AdminUserPage, type AdminUsersRequest } from '../admin'
import type { BattlesCursor } from '../contracts/battles'
import { rosterSnapshotOrNull } from '../core/commands'
import {
  leagueArmy,
  leagueTeams,
  requiredLeagueRosterLimit,
  type LeagueAdmission,
  type LeagueAllowance,
  type LeagueVisibility,
} from '../core/league'
import { TABLE_SHAPES, type TableShape } from '../core/tableShape'
import { CLUB_MEMBER_STATUSES } from '../core/club'
import { openPairing, type LeagueBattleSetup } from '../shared/leagueBattle'
import type { Command } from '../core/battle'
import { z } from 'zod'
import type { LeagueSide } from '../contracts/schemas'
import { SqliteAccountRepository } from './accountRepository'
import { SpacetimeOperator } from './spacetimeOperator'
import { leagueRosterSharingSchema } from '../contracts/leagueRosterSharing'
import { chunks } from '../core/collections'

type Snapshot = NonNullable<Awaited<ReturnType<SpacetimeOperator['battleByToken']>>>
type BattlePlayer = NonNullable<Awaited<ReturnType<SqliteAccountRepository['profileByUserId']>>> & { side: number; automated: boolean }
type RosterSummary = Awaited<ReturnType<SpacetimeOperator['rosterSummariesByUser']>>[number]
/** When an event is played and when its rosters must be sealed by, either unset. */
export type LeagueSchedule = { playsAt: number | null; sealBy: number | null }

type Tournament = NonNullable<NonNullable<Awaited<ReturnType<SpacetimeOperator['leagueByToken']>>>['tournament']>

/** A tournament's own details; its host fields already address and date it, and each read names its admins its own way. */
function tournamentDetails({ token: _token, createdAt: _createdAt, adminIds: _adminIds, ...details }: Tournament) {
  return details
}

export type BattleSeats = { battle: Snapshot['battle']; players: BattlePlayer[] }
export type BattleHistory = BattleSeats & { log: Snapshot['log'] }

const ADMIN_USER_COUNT_FIELDS = {
  rosters: 'rosterCount',
  battles: 'battleCount',
  friends: 'friendCount',
  leagues: 'leagueCount',
} as const satisfies Record<AdminUserCountSort, keyof AdminUser>

function withProductStats<Row extends Omit<AdminUser, (typeof ADMIN_USER_COUNT_FIELDS)[AdminUserCountSort]>>(
  rows: Row[],
  stats: Awaited<ReturnType<SpacetimeOperator['productStats']>>,
) {
  return rows.map((row) => ({
    ...row,
    rosterCount: stats.get(row.id)?.rosterCount ?? 0,
    battleCount: stats.get(row.id)?.battleCount ?? 0,
    leagueCount: stats.get(row.id)?.leagueCount ?? 0,
    friendCount: stats.get(row.id)?.friendCount ?? 0,
  }))
}

function seatPlayer(
  profiles: ReadonlyMap<string, Omit<BattlePlayer, 'side' | 'automated'>>,
  seat: Snapshot['seats'][number],
): BattlePlayer {
  const profile =
    seat.guestName === undefined ? profileOf(profiles, seat.id, 'Battle seat') : { id: seat.id, name: seat.guestName, image: null }
  return { ...profile, side: seat.side, automated: seat.automated }
}

/** The account behind an id the product data names, which the auth database must still hold. */
function profileOf<T>(profiles: ReadonlyMap<string, T>, id: string, role: string): T {
  const profile = profiles.get(id)
  if (!profile) throw new Error(`${role} ${id} is missing from auth database`)
  return profile
}

export class SpacetimeRepository {
  constructor(
    private readonly accounts: SqliteAccountRepository,
    private readonly product: SpacetimeOperator,
  ) {}

  syncReceipt(...args: Parameters<SpacetimeOperator['syncReceipt']>) {
    return this.product.syncReceipt(...args)
  }

  userById(id: string) {
    return this.accounts.userById(id)
  }

  adminEmails() {
    return this.accounts.adminEmails()
  }

  onboardingProgress(userId: string) {
    return this.product.onboardingProgress(userId)
  }

  updateOnboardingProgress(...args: Parameters<SpacetimeOperator['updateOnboardingProgress']>) {
    return this.product.updateOnboardingProgress(...args)
  }

  async adminUsers(input: Partial<AdminUsersRequest> = {}): Promise<AdminUserPage> {
    const practice = await this.product.practiceOpponentIds()
    const sort = input.sort ?? 'joined'
    if (!isAdminUserCountSort(sort)) {
      const page = await this.accounts.adminUserRows({ ...input, sort }, practice)
      return { users: withProductStats(page.users, await this.product.productStats(page.users.map((row) => row.id))), total: page.total }
    }
    const ids = await this.accounts.adminUserIds(input, practice)
    const stats = new Map(
      (await Promise.all(chunks(ids, 100).map((batch) => this.product.productStats(batch)))).flatMap((batch) => [...batch]),
    )
    const field = ADMIN_USER_COUNT_FIELDS[sort]
    const count = (id: string) => stats.get(id)?.[field] ?? 0
    // A stable sort keeps tied players newest first.
    const ranked = ids.toSorted((a, b) => ((input.descending ?? true) ? count(b) - count(a) : count(a) - count(b)))
    const pageSize = input.pageSize ?? 25
    const start = (input.page ?? 0) * pageSize
    return { users: withProductStats(await this.accounts.adminUsersByIds(ranked.slice(start, start + pageSize)), stats), total: ids.length }
  }

  unlinkAccount(...args: Parameters<SqliteAccountRepository['unlinkAccount']>) {
    return this.accounts.unlinkAccount(...args)
  }

  profileByUserId(id: string) {
    return this.accounts.profileByUserId(id)
  }

  isAdmin(id: string) {
    return this.accounts.isAdmin(id)
  }

  githubSponsorship(userId: string) {
    return this.accounts.githubSponsorship(userId)
  }

  namesByIds(ids: readonly string[]) {
    return this.accounts.namesByIds(ids)
  }

  profilesByIds(ids: readonly string[]) {
    return this.accounts.profilesByIds(ids)
  }

  async searchPlayers(userId: string, query: string) {
    const [relationships, practiceIds] = await Promise.all([this.product.friendshipsByUser(userId), this.product.practiceOpponentIds()])
    const excluded = new Set([
      ...practiceIds,
      ...relationships.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId)),
    ])
    const found: Awaited<ReturnType<SqliteAccountRepository['searchPlayerRows']>> = []
    let after: { name: string; id: string } | null = null
    for (let page = 0; page < 12 && found.length < 20; page++) {
      const rows = await this.accounts.searchPlayerRows(userId, query, after, 100)
      found.push(...rows.filter((row) => !excluded.has(row.id)).slice(0, 20 - found.length))
      const last = rows.at(-1)
      if (rows.length < 100 || !last) break
      after = { name: last.name, id: last.id }
    }
    return found
  }

  async practiceOpponents() {
    const ids = await this.product.practiceOpponentIds()
    const profiles = await this.accounts.profilesByIds(ids)
    return ids.map((id) => profileOf(profiles, id, 'Practice opponent'))
  }

  async relationships(userId: string) {
    const rows = await this.product.friendshipsByUser(userId)
    const otherIds = rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId))
    const profiles = await this.accounts.profilesByIds(otherIds)
    return rows
      .map((row) => {
        const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId
        const profile = profileOf(profiles, otherId, 'Friend')
        return {
          requesterId: row.requesterId,
          addresseeId: row.addresseeId,
          acceptedAt: row.acceptedAt,
          otherId,
          otherName: profile.name,
          otherImage: profile.image,
        }
      })
      .sort((left, right) => left.otherName.localeCompare(right.otherName))
  }

  requestFriend(...args: Parameters<SpacetimeOperator['requestFriend']>) {
    return this.product.requestFriend(...args)
  }

  acceptFriend(...args: Parameters<SpacetimeOperator['acceptFriend']>) {
    return this.product.acceptFriend(...args)
  }

  rejectFriend(...args: Parameters<SpacetimeOperator['rejectFriend']>) {
    return this.product.rejectFriend(...args)
  }

  removeFriend(...args: Parameters<SpacetimeOperator['removeFriend']>) {
    return this.product.removeFriend(...args)
  }

  async friendInviteByInviter(inviterId: string) {
    const token = await this.product.friendInviteByInviter(inviterId)
    return token ? { token } : null
  }

  async friendInviteByToken(token: string) {
    const invite = await this.product.friendInviteByToken(token)
    if (!invite) return null
    const inviter = await this.accounts.profileByUserId(invite.inviterId)
    if (!inviter) return null
    return { token, inviterId: inviter.id, inviterName: inviter.name, inviterImage: inviter.image }
  }

  replaceFriendInvite(...args: Parameters<SpacetimeOperator['replaceFriendInvite']>) {
    return this.product.replaceFriendInvite(...args)
  }

  cancelFriendInvite(...args: Parameters<SpacetimeOperator['cancelFriendInvite']>) {
    return this.product.cancelFriendInvite(...args)
  }

  acceptFriendInvite(...args: Parameters<SpacetimeOperator['acceptFriendInvite']>) {
    return this.product.acceptFriendInvite(...args)
  }

  recentMatchupsByUser(...args: Parameters<SpacetimeOperator['recentMatchupsByUser']>) {
    return this.product.recentMatchupsByUser(...args)
  }

  rememberMatchup(...args: Parameters<SpacetimeOperator['rememberMatchup']>) {
    return this.product.rememberMatchup(...args)
  }

  forgetMatchup(...args: Parameters<SpacetimeOperator['forgetMatchup']>) {
    return this.product.forgetMatchup(...args)
  }

  abilityRemindersByUser(...args: Parameters<SpacetimeOperator['abilityRemindersByUser']>) {
    return this.product.abilityRemindersByUser(...args)
  }

  saveAbilityReminder(...args: Parameters<SpacetimeOperator['saveAbilityReminder']>) {
    return this.product.saveAbilityReminder(...args)
  }

  deleteAbilityReminder(...args: Parameters<SpacetimeOperator['deleteAbilityReminder']>) {
    return this.product.deleteAbilityReminder(...args)
  }

  pushEnabled(...args: Parameters<SpacetimeOperator['pushEnabled']>) {
    return this.product.pushEnabled(...args)
  }

  setPushEnabled(...args: Parameters<SpacetimeOperator['setPushEnabled']>) {
    return this.product.setPushEnabled(...args)
  }

  playerDefaults(...args: Parameters<SpacetimeOperator['playerDefaults']>) {
    return this.product.playerDefaults(...args)
  }

  setPlayerDefaults(...args: Parameters<SpacetimeOperator['setPlayerDefaults']>) {
    return this.product.setPlayerDefaults(...args)
  }

  registerPushToken(...args: Parameters<SpacetimeOperator['registerPushToken']>) {
    return this.product.registerPushToken(...args)
  }

  unregisterPushToken(...args: Parameters<SpacetimeOperator['unregisterPushToken']>) {
    return this.product.unregisterPushToken(...args)
  }

  deletePushTokens(...args: Parameters<SpacetimeOperator['deletePushTokens']>) {
    return this.product.deletePushTokens(...args)
  }

  pushTargets(...args: Parameters<SpacetimeOperator['pushTargets']>) {
    return this.product.pushTargets(...args)
  }

  leagueNames(...args: Parameters<SpacetimeOperator['leagueNames']>) {
    return this.product.leagueNames(...args)
  }

  clubNames(...args: Parameters<SpacetimeOperator['clubNames']>) {
    return this.product.clubNames(...args)
  }

  createTournament(input: {
    id: string
    token: string
    eventId: string
    eventToken: string
    ownerId: string
    name: string
    description: string
    visibility: LeagueVisibility
    admission: LeagueAdmission
    playerLimit: number | null
    format?: TableShape
    rosterLimit?: number
    allowances?: readonly LeagueAllowance[]
    ownerPlays?: boolean
    rounds?: number | null
    pointsBudget?: number | null
    soloPoints?: number | null
    allyPoints?: number | null
    schedule?: LeagueSchedule
    now: number
  }) {
    return this.product.leagueCommand(
      { ...input, op: 'create', format: input.format ?? null, rosterLimit: input.rosterLimit ?? null },
      z.enum(['too-small', 'forbidden']).nullable(),
    )
  }

  createClubGame(input: {
    eventId: string
    eventToken: string
    clubToken: string
    timeZone?: string
    ownerId: string
    format?: TableShape
    rosterLimit?: number
    allowances?: readonly LeagueAllowance[]
    pointsBudget?: number | null
    soloPoints?: number | null
    allyPoints?: number | null
    schedule?: LeagueSchedule
    now: number
  }) {
    return this.product.leagueCommand(
      { ...input, op: 'create-club-game', format: input.format ?? null, rosterLimit: input.rosterLimit ?? null },
      z.literal('forbidden').nullable(),
    )
  }

  /** Saves what is given: a tournament's details, the event's rule and its schedule, together or not at all. */
  updateLeague(
    token: string,
    ownerId: string,
    input: {
      details?: {
        name: string
        description: string
        visibility: LeagueVisibility
        admission: LeagueAdmission
        playerLimit: number | null
      }
      rule?: {
        format: TableShape
        rosterLimit: number
        allowances?: readonly LeagueAllowance[]
        rounds?: number | null
        pointsBudget?: number | null
        soloPoints?: number | null
        allyPoints?: number | null
      }
      schedule?: LeagueSchedule
    },
  ) {
    return this.product.leagueCommand(
      { op: 'update', token, ownerId, ...input },
      z.union([
        z.object({ admitted: z.array(z.string()), ruleChanged: z.boolean() }),
        z.enum(['missing', 'forbidden', 'below-accepted', 'team-minimum', 'closed', 'sealed']),
      ]),
    )
  }

  pairLeagueRound(input: { token: string; eventToken: string; ownerId: string; round: number; pairs: [string, string | null][] }) {
    return this.product.leagueCommand({ op: 'pair-round', ...input }, z.enum(['paired', 'not-ready', 'stale', 'missing', 'forbidden']))
  }

  deleteLeague(token: string, ownerId: string) {
    return this.product.leagueCommand({ op: 'delete', token, ownerId }, z.enum(['deleted', 'missing', 'forbidden']))
  }

  setLeagueAdmins(token: string, ownerId: string, userIds: readonly string[], now: number) {
    return this.product.leagueCommand(
      { op: 'set-admins', token, ownerId, userIds, now },
      z.union([z.object({ added: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'not-friends'])]),
    )
  }

  eventAddress(...args: Parameters<SpacetimeOperator['eventAddress']>) {
    return this.product.eventAddress(...args)
  }

  async leaguesVisibleTo(userId: string | null) {
    const rows = await this.product.leaguesVisibleTo(userId, 100)
    const owners = await this.accounts.profilesByIds(rows.flatMap((row) => (row.tournament ? [row.tournament.ownerId] : [])))
    return rows.map(({ kind, token, tournament, club, event, personal, joined, accepted, occupied, ownEntry }) => {
      const owner = tournament && profileOf(owners, tournament.ownerId, 'Tournament owner')
      return {
        kind,
        token,
        tournament:
          tournament && owner
            ? { ...tournamentDetails(tournament), adminIds: tournament.adminIds, ownerName: owner.name, ownerImage: owner.image }
            : null,
        club,
        personal,
        eventToken: event.token,
        createdAt: event.createdAt,
        format: event.format,
        rosterLimit: event.rosterLimit,
        revealedAt: event.revealedAt,
        pointsBudget: event.pointsBudget,
        soloPoints: event.soloPoints,
        allyPoints: event.allyPoints,
        playsAt: event.playsAt,
        sealBy: event.sealBy,
        entrantCount: accepted,
        currentEntrantCount: joined,
        occupiedCount: occupied,
        ownEntry: ownEntry
          ? {
              status: ownEntry.status,
              submitted: ownEntry.rosterSnapshot !== null,
              rosterName: ownEntry.rosterName,
              requiredLimit: requiredLeagueRosterLimit(event.format, event.rosterLimit, ownEntry.requiredLimit, ownEntry.teamId),
            }
          : null,
      }
    })
  }

  createClub(input: {
    id: string
    token: string
    ownerId: string
    name: string
    description: string
    visibility: LeagueVisibility
    admission: LeagueAdmission
    now: number
  }) {
    return this.product.clubCommand({ ...input, op: 'create' }, z.literal('created'))
  }

  updateClub(
    token: string,
    actorId: string,
    input: { name: string; description: string; visibility: LeagueVisibility; admission: LeagueAdmission },
  ) {
    return this.product.clubCommand(
      { op: 'update', token, actorId, ...input },
      z.union([z.object({ admitted: z.array(z.string()) }), z.enum(['missing', 'forbidden'])]),
    )
  }

  deleteClub(token: string, actorId: string) {
    return this.product.clubCommand({ op: 'delete', token, actorId }, z.enum(['deleted', 'missing', 'forbidden']))
  }

  joinClub(token: string, userId: string, now: number) {
    return this.product.clubCommand(
      { op: 'join', token, userId, now },
      z.union([z.object({ status: z.enum(CLUB_MEMBER_STATUSES), organizerIds: z.array(z.string()) }), z.enum(['missing', 'full'])]),
    )
  }

  leaveClub(token: string, userId: string) {
    return this.product.clubCommand({ op: 'leave', token, userId }, z.enum(['left', 'missing', 'owner']))
  }

  moderateClubMember(token: string, actorId: string, userId: string, accept: boolean) {
    return this.product.clubCommand(
      { op: 'moderate', token, actorId, userId, accept },
      z.enum(['accepted', 'rejected', 'missing', 'forbidden']),
    )
  }

  removeClubMember(token: string, actorId: string, userId: string) {
    return this.product.clubCommand({ op: 'remove', token, actorId, userId }, z.enum(['removed', 'missing', 'forbidden']))
  }

  setClubAdmins(token: string, actorId: string, userIds: readonly string[]) {
    return this.product.clubCommand(
      { op: 'set-admins', token, actorId, userIds },
      z.union([z.object({ added: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'not-members'])]),
    )
  }

  async clubByToken(token: string) {
    const record = await this.product.clubByToken(token)
    if (!record) return undefined
    const profiles = await this.accounts.profilesByIds(record.members.map((member) => member.userId))
    const owner = profileOf(profiles, record.club.ownerId, 'Club owner')
    return {
      ...record.club,
      games: record.games,
      ownerName: owner.name,
      ownerImage: owner.image,
      members: record.members.flatMap((member) => {
        const profile = profiles.get(member.userId)
        return profile ? [{ ...member, name: profile.name, image: profile.image }] : []
      }),
    }
  }

  async clubsVisibleTo(userId: string | null) {
    const rows = await this.product.clubsVisibleTo(userId, 100)
    const owners = await this.accounts.profilesByIds(rows.map((row) => row.club.ownerId))
    return rows.map(({ club, adminIds, memberCount, battleCount, lastBattleAt, ownMember }) => {
      const owner = profileOf(owners, club.ownerId, 'Club owner')
      return { ...club, ownerName: owner.name, ownerImage: owner.image, adminIds, memberCount, battleCount, lastBattleAt, ownMember }
    })
  }

  outdatedLeagueEntriesForRoster(userId: string, rosterId: string) {
    return this.product.outdatedLeagueEntriesForRoster(userId, rosterId)
  }

  async friendLeagueRosters(viewerId: string) {
    const rows = await this.product.friendLeagueRosters(viewerId)
    const owners = await this.accounts.profilesByIds(rows.map((row) => row.userId))
    return rows.flatMap((row) => {
      const owner = owners.get(row.userId)
      return owner ? [{ ...row, ownerName: owner.name, ownerImage: owner.image }] : []
    })
  }

  async leagueBattleCandidates(userId: string, participantIds: readonly string[]) {
    const rows = await this.product.leagueBattleCandidates(userId, participantIds)
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

  async leagueByToken(token: string, viewerId: string | null = null, eventToken?: string) {
    const record = await this.product.leagueByToken(token, eventToken)
    if (!record) return undefined
    const { kind, tournament, club, event, organizerIds, entries, teams, teamWarlords, pairings } = record
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
    const pairs = leagueTeams(
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
              admins: tournament.adminIds.flatMap((id) => {
                const admin = profiles.get(id)
                return admin ? [{ id, name: admin.name, image: admin.image }] : []
              }),
            }
          : null,
      club,
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
      playsAt: event.playsAt,
      sealBy: event.sealBy,
      remindedAt: event.remindedAt,
      pairings,
      occupiedCount: entries.filter((entry) => entry.status !== 'rejected').length,
      entries: entries.map((entry) => {
        const profile = profileOf(profiles, entry.userId, 'League entrant')
        const roster = rosters.get(entry.userId) ?? null
        const pair = pairs.find((candidate) => candidate.userIds.includes(entry.userId))
        return {
          userId: entry.userId,
          name: profile.name,
          image: profile.image,
          status: entry.status,
          joinedAt: entry.joinedAt,
          submitted: entry.rosterSnapshot !== null,
          rosterName: revealed || viewerId === entry.userId ? entry.rosterName : null,
          army: revealed && roster ? leagueArmy(roster) : null,
          sealedAt: revealed ? entry.submittedAt : null,
          teamId: entry.teamId,
          requiredLimit: requiredLeagueRosterLimit(event.format, event.rosterLimit, entry.requiredLimit, entry.teamId),
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

  joinLeague(token: string, userId: string, now: number, memberLimit: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'join', token, userId, now, memberLimit, eventToken: eventToken ?? '', noticeResults: true },
      z.union([
        z.object({ status: z.literal('pending'), organizerIds: z.array(z.string()) }),
        z.enum(['pending', 'accepted', 'rejected', 'missing', 'closed', 'full', 'members-only']),
      ]),
    )
  }

  moderateLeagueEntry(
    token: string,
    ownerId: string,
    userId: string,
    status: 'accepted' | 'rejected',
    memberLimit: number,
    eventToken?: string,
  ) {
    return this.product.leagueCommand(
      { op: 'moderate', token, ownerId, userId, status, memberLimit, eventToken: eventToken ?? '', noticeResults: true },
      z.union([
        z.object({ rejected: z.boolean(), resealIds: z.array(z.string()) }),
        z.enum(['admitted', 'updated', 'missing', 'forbidden', 'closed', 'full']),
      ]),
    )
  }

  addLeagueEntrants(token: string, ownerId: string, userIds: readonly string[], memberLimit: number, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'add', token, ownerId, userIds, memberLimit, now, eventToken: eventToken ?? '' },
      z.union([z.object({ added: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'closed', 'not-friends', 'not-members', 'full'])]),
    )
  }

  admitLeagueEntries(token: string, ownerId: string, userIds: readonly string[], eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'admit', token, ownerId, userIds, eventToken: eventToken ?? '' },
      z.union([z.object({ admitted: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'closed'])]),
    )
  }

  assignLeagueRosterRequirement(token: string, ownerId: string, userId: string, requiredLimit: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'assign-limit', token, ownerId, userId, requiredLimit, eventToken: eventToken ?? '', noticeResults: true },
      z.union([
        z.object({ resealIds: z.array(z.string()) }),
        z.enum(['updated', 'missing', 'forbidden', 'closed', 'wrong-format', 'wrong-limit']),
      ]),
    )
  }

  assignLeagueTeam(token: string, ownerId: string, userIds: readonly string[], teamId: string, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'assign-team', token, ownerId, userIds, teamId, eventToken: eventToken ?? '', noticeResults: true },
      z.union([z.object({ resealIds: z.array(z.string()) }), z.enum(['updated', 'missing', 'forbidden', 'closed', 'wrong-format'])]),
    )
  }

  chooseLeagueSide(token: string, ownerId: string, side: LeagueSide | null, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'set-side', token, ownerId, side, now, eventToken: eventToken ?? '' },
      z.enum(['updated', 'missing', 'forbidden', 'closed', 'wrong-format', 'full', 'members-only']),
    )
  }

  submitLeagueRoster(input: {
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
    return this.product.leagueCommand(
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

  setLeagueTeamDisposition(token: string, ownerId: string, disposition: string, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'set-team-disposition', token, ownerId, disposition, now, eventToken: eventToken ?? '' },
      z.union([z.object({ outcome: z.literal('chosen') }), z.object({ outcome: z.enum(['missing', 'closed', 'not-offered']) })]),
    )
  }

  setLeagueTeamWarlord(token: string, ownerId: string, userId: string, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'set-team-warlord', token, ownerId, userId, now, eventToken: eventToken ?? '' },
      z.union([z.object({ outcome: z.literal('chosen') }), z.object({ outcome: z.enum(['missing', 'closed', 'not-offered']) })]),
    )
  }

  revealLeague(token: string, ownerId: string, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'reveal', token, ownerId, now, eventToken: eventToken ?? '' },
      z.union([
        z.object({ outcome: z.literal('revealed'), entrantIds: z.array(z.string()) }),
        z.object({ outcome: z.literal('not-ready') }),
        z.object({ outcome: z.literal('invalid-warlords'), format: z.enum(TABLE_SHAPES) }),
      ]),
    )
  }

  remindLeague(token: string, ownerId: string, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'remind', token, ownerId, now, eventToken: eventToken ?? '' },
      z.union([
        z.object({ outcome: z.literal('reminded'), recipientIds: z.array(z.string()) }),
        z.object({ outcome: z.literal('too-soon'), remindedAt: z.number() }),
        z.object({ outcome: z.literal('nobody') }),
        z.enum(['missing', 'forbidden']),
      ]),
    )
  }

  unsealLeagueRoster(token: string, ownerId: string, userId: string, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'unseal', token, ownerId, userId, eventToken: eventToken ?? '' },
      z.enum(['unsealed', 'missing', 'forbidden', 'not-revealed']),
    )
  }

  async leagueRoster(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const row = await this.product.leagueRosters(token, userId, eventToken, readerId)
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

  leagueRosterSharing(token: string, eventToken: string | undefined, userId: string) {
    return this.product.leagueRosterSharing(token, eventToken ?? '', userId)
  }

  updateLeagueRosterSharing(
    input: {
      token: string
      eventToken: string | undefined
      ownerId: string
    } & ({ op: 'share-roster'; submittedAt: number; now: number; rosterId: string } | { op: 'dismiss-roster-sharing' }),
  ) {
    return this.product.leagueCommand(
      { ...input, eventToken: input.eventToken ?? '' },
      z.union([leagueRosterSharingSchema, z.enum(['missing', 'forbidden', 'unavailable', 'stale'])]),
    )
  }

  async createLeagueBattle<T>(
    input: { id: string; token: string; leagueToken: string; eventToken?: string; userId: string; userIds: string[]; now: number },
    prepare: (
      league: LeagueBattleSetup,
    ) =>
      | { allyIds: string[]; opponentIds: string[]; initialCommands: Command[]; result: T }
      | Promise<{ allyIds: string[]; opponentIds: string[]; initialCommands: Command[]; result: T }>,
  ): Promise<T | undefined> {
    const record = await this.product.leagueByToken(input.leagueToken, input.eventToken)
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
      revealedAt: event.revealedAt,
      rounds: event.rounds,
      paired: Boolean(pairing),
      entries: entries.map((entry) => ({
        userId: entry.userId,
        requiredLimit: entry.requiredLimit,
        snapshot: entry.rosterSnapshot,
        teamId: entry.teamId,
        teamDisposition: (entry.teamId && picks.get(entry.teamId)) ?? null,
        teamWarlord: (entry.teamId && warlords.get(entry.teamId)) ?? null,
      })),
    })
    const created = await this.product.leagueCommand(
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

  syncRoster(...args: Parameters<SpacetimeOperator['syncRoster']>) {
    return this.product.syncRoster(...args)
  }

  saveRoster(...args: Parameters<SpacetimeOperator['saveRoster']>) {
    return this.product.saveRoster(...args)
  }

  rostersByUser(...args: Parameters<SpacetimeOperator['rostersByUser']>) {
    return this.product.rostersByUser(...args)
  }

  rostersByIds(...args: Parameters<SpacetimeOperator['rostersByIds']>) {
    return this.product.rostersByIds(...args)
  }

  homeRostersByUser(...args: Parameters<SpacetimeOperator['homeRostersByUser']>) {
    return this.product.homeRostersByUser(...args)
  }

  publicRostersByUser(...args: Parameters<SpacetimeOperator['publicRostersByUser']>) {
    return this.product.publicRostersByUser(...args)
  }

  discoverRosters(...args: Parameters<SpacetimeOperator['discoverRosters']>) {
    return this.product.discoverRosters(...args)
  }

  rosterSummariesByUser(...args: Parameters<SpacetimeOperator['rosterSummariesByUser']>): Promise<RosterSummary[]> {
    return this.product.rosterSummariesByUser(...args)
  }

  rosterGroupByUser(...args: Parameters<SpacetimeOperator['rosterGroupByUser']>) {
    return this.product.rosterGroupByUser(...args)
  }

  roster(...args: Parameters<SpacetimeOperator['roster']>) {
    return this.product.roster(...args)
  }

  setRosterVisibility(...args: Parameters<SpacetimeOperator['setRosterVisibility']>) {
    return this.product.setRosterVisibility(...args)
  }

  unitLoadoutsByUser(...args: Parameters<SpacetimeOperator['unitLoadoutsByUser']>) {
    return this.product.unitLoadoutsByUser(...args)
  }

  saveUnitLoadout(...args: Parameters<SpacetimeOperator['saveUnitLoadout']>) {
    return this.product.saveUnitLoadout(...args)
  }

  renameUnitLoadout(...args: Parameters<SpacetimeOperator['renameUnitLoadout']>) {
    return this.product.renameUnitLoadout(...args)
  }

  deleteUnitLoadout(...args: Parameters<SpacetimeOperator['deleteUnitLoadout']>) {
    return this.product.deleteUnitLoadout(...args)
  }

  setRosterLocked(...args: Parameters<SpacetimeOperator['setRosterLocked']>) {
    return this.product.setRosterLocked(...args)
  }

  setRosterArchived(...args: Parameters<SpacetimeOperator['setRosterArchived']>) {
    return this.product.setRosterArchived(...args)
  }

  collectionProfile(...args: Parameters<SpacetimeOperator['collectionProfile']>) {
    return this.product.collectionProfile(...args)
  }

  collectionByUser(...args: Parameters<SpacetimeOperator['collectionByUser']>) {
    return this.product.collectionByUser(...args)
  }

  addToCollection(...args: Parameters<SpacetimeOperator['addToCollection']>) {
    return this.product.addToCollection(...args)
  }

  removeFromCollection(...args: Parameters<SpacetimeOperator['removeFromCollection']>) {
    return this.product.removeFromCollection(...args)
  }

  setCollectionModels(...args: Parameters<SpacetimeOperator['setCollectionModels']>) {
    return this.product.setCollectionModels(...args)
  }

  setCollectionProgress(...args: Parameters<SpacetimeOperator['setCollectionProgress']>) {
    return this.product.setCollectionProgress(...args)
  }

  setCollectionCountsAs(...args: Parameters<SpacetimeOperator['setCollectionCountsAs']>) {
    return this.product.setCollectionCountsAs(...args)
  }

  collectionWishesByUser(...args: Parameters<SpacetimeOperator['collectionWishesByUser']>) {
    return this.product.collectionWishesByUser(...args)
  }

  setCollectionWanted(...args: Parameters<SpacetimeOperator['setCollectionWanted']>) {
    return this.product.setCollectionWanted(...args)
  }

  importCollection(...args: Parameters<SpacetimeOperator['importCollection']>) {
    return this.product.importCollection(...args)
  }

  setCollectionPhoto(...args: Parameters<SpacetimeOperator['setCollectionPhoto']>) {
    return this.product.setCollectionPhoto(...args)
  }

  removeCollectionPhoto(...args: Parameters<SpacetimeOperator['removeCollectionPhoto']>) {
    return this.product.removeCollectionPhoto(...args)
  }

  collectionPhoto(...args: Parameters<SpacetimeOperator['collectionPhoto']>) {
    return this.product.collectionPhoto(...args)
  }

  datasheetPhotos(...args: Parameters<SpacetimeOperator['datasheetPhotos']>) {
    return this.product.datasheetPhotos(...args)
  }

  setCollectionPhotoLike(...args: Parameters<SpacetimeOperator['setCollectionPhotoLike']>) {
    return this.product.setCollectionPhotoLike(...args)
  }

  removeCollectionPhotoById(...args: Parameters<SpacetimeOperator['removeCollectionPhotoById']>) {
    return this.product.removeCollectionPhotoById(...args)
  }

  collectionPhotoForAdmin(...args: Parameters<SpacetimeOperator['collectionPhotoForAdmin']>) {
    return this.product.collectionPhotoForAdmin(...args)
  }

  reportCollectionPhoto(...args: Parameters<SpacetimeOperator['reportCollectionPhoto']>) {
    return this.product.reportCollectionPhoto(...args)
  }

  keepCollectionPhoto(...args: Parameters<SpacetimeOperator['keepCollectionPhoto']>) {
    return this.product.keepCollectionPhoto(...args)
  }

  heldCollectionPhotos(...args: Parameters<SpacetimeOperator['heldCollectionPhotos']>) {
    return this.product.heldCollectionPhotos(...args)
  }

  adminCollectionPhotos(...args: Parameters<SpacetimeOperator['adminCollectionPhotos']>) {
    return this.product.adminCollectionPhotos(...args)
  }

  collectionPhotoDeletions(...args: Parameters<SpacetimeOperator['collectionPhotoDeletions']>) {
    return this.product.collectionPhotoDeletions(...args)
  }

  collectionPhotoIds(...args: Parameters<SpacetimeOperator['collectionPhotoIds']>) {
    return this.product.collectionPhotoIds(...args)
  }

  clearCollectionPhotoDeletions(...args: Parameters<SpacetimeOperator['clearCollectionPhotoDeletions']>) {
    return this.product.clearCollectionPhotoDeletions(...args)
  }

  queueCollectionPhotoDeletion(...args: Parameters<SpacetimeOperator['queueCollectionPhotoDeletion']>) {
    return this.product.queueCollectionPhotoDeletion(...args)
  }

  favouriteFactionsByUser(...args: Parameters<SpacetimeOperator['favouriteFactionsByUser']>) {
    return this.product.favouriteFactionsByUser(...args)
  }

  addFavouriteFaction(...args: Parameters<SpacetimeOperator['addFavouriteFaction']>) {
    return this.product.addFavouriteFaction(...args)
  }

  removeFavouriteFaction(...args: Parameters<SpacetimeOperator['removeFavouriteFaction']>) {
    return this.product.removeFavouriteFaction(...args)
  }

  favouriteDatasheetsByUser(...args: Parameters<SpacetimeOperator['favouriteDatasheetsByUser']>) {
    return this.product.favouriteDatasheetsByUser(...args)
  }

  addFavouriteDatasheet(...args: Parameters<SpacetimeOperator['addFavouriteDatasheet']>) {
    return this.product.addFavouriteDatasheet(...args)
  }

  removeFavouriteDatasheet(...args: Parameters<SpacetimeOperator['removeFavouriteDatasheet']>) {
    return this.product.removeFavouriteDatasheet(...args)
  }

  favouriteDetachmentsByUser(...args: Parameters<SpacetimeOperator['favouriteDetachmentsByUser']>) {
    return this.product.favouriteDetachmentsByUser(...args)
  }

  addFavouriteDetachment(...args: Parameters<SpacetimeOperator['addFavouriteDetachment']>) {
    return this.product.addFavouriteDetachment(...args)
  }

  removeFavouriteDetachment(...args: Parameters<SpacetimeOperator['removeFavouriteDetachment']>) {
    return this.product.removeFavouriteDetachment(...args)
  }

  deleteRoster(...args: Parameters<SpacetimeOperator['deleteRoster']>) {
    return this.product.deleteRoster(...args)
  }

  lendRoster(...args: Parameters<SpacetimeOperator['lendRoster']>) {
    return this.product.lendRoster(...args)
  }

  endRosterLoan(...args: Parameters<SpacetimeOperator['endRosterLoan']>) {
    return this.product.endRosterLoan(...args)
  }

  rosterLoansByRoster(...args: Parameters<SpacetimeOperator['rosterLoansByRoster']>) {
    return this.product.rosterLoansByRoster(...args)
  }

  usableRoster(...args: Parameters<SpacetimeOperator['usableRoster']>) {
    return this.product.usableRoster(...args)
  }

  rostersLentTo(...args: Parameters<SpacetimeOperator['rostersLentTo']>) {
    return this.product.rostersLentTo(...args)
  }

  async createBattle(...args: Parameters<SpacetimeOperator['createBattle']>) {
    await this.product.createBattle(...args)
  }

  deleteBattleForOperator(battleId: string) {
    return this.product.deleteBattleForOperator(battleId)
  }

  deleteBattle(...args: Parameters<SpacetimeOperator['deleteBattle']>) {
    return this.product.deleteBattle(...args)
  }

  guestInvite(...args: Parameters<SpacetimeOperator['guestInvite']>) {
    return this.product.guestInvite(...args)
  }

  replaceGuestInvite(...args: Parameters<SpacetimeOperator['replaceGuestInvite']>) {
    return this.product.replaceGuestInvite(...args)
  }

  /** The invitation with the name of the host who shared it, which is all its landing page shows. */
  async guestSeatByInvite(invite: string) {
    const seat = await this.product.guestSeatByInvite(invite)
    if (!seat) return null
    const host = seat.hostId ? (await this.accounts.profilesByIds([seat.hostId])).get(seat.hostId) : undefined
    return { ...seat, hostName: host?.name ?? null }
  }

  joinGuestSeat(...args: Parameters<SpacetimeOperator['joinGuestSeat']>) {
    return this.product.joinGuestSeat(...args)
  }

  guestDevice(...args: Parameters<SpacetimeOperator['guestDevice']>) {
    return this.product.guestDevice(...args)
  }

  claimGuestSeat(...args: Parameters<SpacetimeOperator['claimGuestSeat']>) {
    return this.product.claimGuestSeat(...args)
  }

  async battleByToken(token: string) {
    const snapshot = await this.product.battleByToken(token)
    return snapshot ? this.battleSeats(snapshot) : undefined
  }

  async battleHistoryByToken(token: string) {
    const snapshot = await this.product.battleByToken(token)
    return snapshot ? this.battleHistory(snapshot) : undefined
  }

  private async battleSeats(snapshot: Snapshot) {
    const profiles = await this.seatProfiles([snapshot])
    return { battle: snapshot.battle, players: snapshot.seats.map((seat) => seatPlayer(profiles, seat)) }
  }

  /** Accounts come from the auth database; a guest seat carries the only name it has. */
  private seatProfiles(snapshots: readonly Pick<Snapshot, 'seats'>[]) {
    return this.accounts.profilesByIds(
      snapshots.flatMap((row) => row.seats.filter((seat) => seat.guestName === undefined).map((seat) => seat.id)),
    )
  }

  private async battleHistory(snapshot: Snapshot): Promise<BattleHistory> {
    return { ...(await this.battleSeats(snapshot)), log: snapshot.log }
  }

  private async feed(input: Parameters<SpacetimeOperator['battleFeed']>[0]) {
    const page = await this.product.battleFeed(input)
    const profiles = await this.seatProfiles(page.battles)
    const battles = page.battles.map((row) => ({
      battle: row.battle,
      at: row.at,
      players: row.seats.map((seat) => seatPlayer(profiles, seat)),
      log: row.log,
    }))
    return { battles, nextCursor: page.nextCursor }
  }

  async battlesByUser(userId: string, page?: { limit: number; before?: BattlesCursor; withUserId?: string }) {
    return this.feed({ scope: 'user', userId, withUserId: page?.withUserId, before: page?.before, limit: page?.limit ?? 500 })
  }

  async battlesByLeagueEvent(
    leagueToken: string,
    eventToken: string,
    page: { limit: number; before?: BattlesCursor; viewerId?: string | null },
  ) {
    return this.feed({ scope: 'league', leagueToken, eventToken, before: page.before, limit: page.limit, viewerId: page.viewerId })
  }

  async battlesByClub(clubToken: string, page: { limit: number; before?: BattlesCursor }) {
    return this.feed({ scope: 'club', clubToken, before: page.before, limit: page.limit })
  }

  battleClubs(battleId: string) {
    return this.product.battleClubs(battleId)
  }

  async publicBattles(page: { limit: number; before?: BattlesCursor; viewerId?: string | null }) {
    return this.feed({ scope: 'public', viewerId: page.viewerId, before: page.before, limit: page.limit })
  }

  async battlesByFriends(userId: string, page: { limit: number; before?: BattlesCursor }) {
    return this.feed({ scope: 'friends', userId, before: page.before, limit: page.limit })
  }

  async watchableBattlesSince(since: number, limit: number) {
    return (await this.feed({ scope: 'watchable', since, limit })).battles
  }

  async battlesSeatedBy(userId: string, limit: number, viewerId: string | null) {
    return (await this.feed({ scope: 'profile', userId, viewerId, limit })).battles
  }

  submit(...args: Parameters<SpacetimeOperator['submit']>) {
    return this.product.submit(...args)
  }
}

export type RepositoryPort = Pick<SpacetimeRepository, keyof SpacetimeRepository>
