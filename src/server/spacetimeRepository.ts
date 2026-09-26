import type { AdminUserPage } from '../admin'
import type { BattleHistory, BattlesCursor, Repository, RepositoryPort } from '../db/repository'
import { parseRosterSnapshot } from '../core/commands'
import { requiredLeagueRosterLimit } from '../core/league'
import type { TableShape } from '../core/tableShape'
import type { Command } from '../core/battle'
import { z } from 'zod'
import { D1AccountRepository } from './d1AccountRepository'
import { SpacetimeOperator } from './spacetimeOperator'

type Snapshot = NonNullable<Awaited<ReturnType<SpacetimeOperator['battleByToken']>>>

export class SpacetimeRepository implements RepositoryPort {
  constructor(
    private readonly accounts: D1AccountRepository,
    private readonly product: SpacetimeOperator,
  ) {}

  userById(id: string) {
    return this.accounts.userById(id)
  }

  onboardingProgress(userId: string) {
    return this.product.onboardingProgress(userId)
  }

  updateOnboardingProgress(...args: Parameters<Repository['updateOnboardingProgress']>) {
    return this.product.updateOnboardingProgress(...args)
  }

  async adminUsers(input: Parameters<Repository['adminUsers']>[0] = {}): Promise<AdminUserPage> {
    const practice = await this.product.practiceOpponentIds()
    const page = await this.accounts.adminUserRows(input, practice)
    const stats = await this.product.productStats(page.users.map((row) => row.id))
    return {
      users: page.users.map((row) => ({
        ...row,
        rosterCount: stats.get(row.id)?.rosterCount ?? 0,
        battleCount: stats.get(row.id)?.battleCount ?? 0,
      })),
      nextCursor: page.nextCursor,
    }
  }

  unlinkAccount(...args: Parameters<Repository['unlinkAccount']>) {
    return this.accounts.unlinkAccount(...args)
  }

  profileByUserId(id: string) {
    return this.accounts.profileByUserId(id)
  }

  namesByIds(ids: readonly string[]) {
    return this.accounts.namesByIds(ids)
  }

  async searchPlayers(userId: string, query: string) {
    const [relationships, practiceIds] = await Promise.all([this.product.friendshipsByUser(userId), this.product.practiceOpponentIds()])
    const excluded = new Set([
      ...practiceIds,
      ...relationships.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId)),
    ])
    const found: Awaited<ReturnType<D1AccountRepository['searchPlayerRows']>> = []
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
    return ids.map((id) => {
      const profile = profiles.get(id)
      if (!profile) throw new Error(`Practice opponent ${id} is missing from D1`)
      return profile
    })
  }

  async relationships(userId: string) {
    const rows = await this.product.friendshipsByUser(userId)
    const otherIds = rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId))
    const profiles = await this.accounts.profilesByIds(otherIds)
    return rows
      .map((row) => {
        const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId
        const profile = profiles.get(otherId)
        if (!profile) throw new Error(`Friend ${otherId} is missing from D1`)
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

  requestFriend(...args: Parameters<Repository['requestFriend']>) {
    return this.product.requestFriend(...args)
  }

  acceptFriend(...args: Parameters<Repository['acceptFriend']>) {
    return this.product.acceptFriend(...args)
  }

  removeFriend(...args: Parameters<Repository['removeFriend']>) {
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

  replaceFriendInvite(...args: Parameters<Repository['replaceFriendInvite']>) {
    return this.product.replaceFriendInvite(...args)
  }

  cancelFriendInvite(...args: Parameters<Repository['cancelFriendInvite']>) {
    return this.product.cancelFriendInvite(...args)
  }

  acceptFriendInvite(...args: Parameters<Repository['acceptFriendInvite']>) {
    return this.product.acceptFriendInvite(...args)
  }

  pushEnabled(...args: Parameters<Repository['pushEnabled']>) {
    return this.product.pushEnabled(...args)
  }

  setPushEnabled(...args: Parameters<Repository['setPushEnabled']>) {
    return this.product.setPushEnabled(...args)
  }

  registerPushToken(...args: Parameters<Repository['registerPushToken']>) {
    return this.product.registerPushToken(...args)
  }

  unregisterPushToken(...args: Parameters<Repository['unregisterPushToken']>) {
    return this.product.unregisterPushToken(...args)
  }

  deletePushTokens(...args: Parameters<Repository['deletePushTokens']>) {
    return this.product.deletePushTokens(...args)
  }

  pushTargets(...args: Parameters<Repository['pushTargets']>) {
    return this.product.pushTargets(...args)
  }

  leagueNames(...args: Parameters<Repository['leagueNames']>) {
    return this.product.leagueNames(...args)
  }

  async createLeague(input: Parameters<Repository['createLeague']>[0]) {
    await this.product.leagueCommand(
      {
        ...input,
        op: 'create',
        eventId: input.eventId ?? input.id,
        eventToken: input.eventToken ?? input.token,
        recurring: input.recurring ?? true,
        format: input.format ?? null,
        rosterLimit: input.rosterLimit ?? null,
        playerLimit: input.playerLimit ?? null,
      },
      z.null(),
    )
  }

  createLeagueEvent(input: Parameters<Repository['createLeagueEvent']>[0]) {
    return this.product.leagueCommand(
      {
        ...input,
        op: 'create-event',
        token: input.leagueToken,
        eventToken: input.token,
        format: input.format ?? null,
        rosterLimit: input.rosterLimit ?? null,
      },
      z.enum(['created', 'missing', 'forbidden', 'open', 'too-small']),
    )
  }

  updateLeagueEvent(token: string, ownerId: string, rule: { format: TableShape; rosterLimit: number }, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'update-event', token, ownerId, ...rule, eventToken: eventToken ?? '' },
      z.enum(['updated', 'missing', 'forbidden', 'closed', 'sealed', 'too-small']),
    )
  }

  makeLeagueRecurring(token: string, ownerId: string) {
    return this.product.leagueCommand({ op: 'recurring', token, ownerId }, z.enum(['updated', 'missing', 'forbidden']))
  }

  updateLeague(token: string, ownerId: string, input: Parameters<Repository['updateLeague']>[2]) {
    return this.product.leagueCommand(
      { op: 'update', token, ownerId, ...input },
      z.union([z.object({ admitted: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'below-accepted', 'team-minimum'])]),
    )
  }

  deleteLeague(token: string, ownerId: string) {
    return this.product.leagueCommand({ op: 'delete', token, ownerId }, z.enum(['deleted', 'missing', 'forbidden']))
  }

  async leaguesVisibleTo(userId: string | null, limit = 100) {
    const rows = await this.product.leaguesVisibleTo(userId, Math.min(Math.max(limit, 1), 100))
    const owners = await this.accounts.profilesByIds(rows.map((row) => row.league.ownerId))
    return rows.map(({ league, event, personal, joined, accepted, occupied, ownEntry }) => {
      const owner = owners.get(league.ownerId)
      if (!owner) throw new Error(`League owner ${league.ownerId} is missing from D1`)
      return {
        ...league,
        ownerName: owner.name,
        ownerImage: owner.image,
        personal,
        eventToken: event.token,
        eventNumber: event.number,
        format: event.format,
        rosterLimit: event.rosterLimit,
        revealedAt: event.revealedAt,
        entrantCount: accepted,
        currentEntrantCount: joined,
        occupiedCount: occupied,
        ownEntry: ownEntry
          ? { status: ownEntry.status, submitted: ownEntry.rosterSnapshot !== null, rosterName: ownEntry.rosterName }
          : null,
      }
    })
  }

  async leagueBattleCandidates(userId: string, participantIds: readonly string[]) {
    const rows = await this.product.leagueBattleCandidates(userId, participantIds)
    return rows.map(({ league, event, entries }) => ({
      token: league.token,
      name: league.name,
      eventToken: event.token,
      eventNumber: event.number,
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
    if (!snapshot) return null
    try {
      return parseRosterSnapshot(snapshot).built?.limit ?? null
    } catch {
      return null
    }
  }

  async leagueByToken(token: string, viewerId: string | null = null, eventToken?: string) {
    const record = await this.product.leagueByToken(token, eventToken)
    if (!record) return undefined
    const { league, selected, latest, events, entries, eventCount, latestEntryCount, latestAcceptedCount } = record
    const profiles = await this.accounts.profilesByIds([league.ownerId, ...entries.map((entry) => entry.userId)])
    const owner = profiles.get(league.ownerId)
    if (!owner) throw new Error(`League owner ${league.ownerId} is missing from D1`)
    return {
      ...league,
      ownerName: owner.name,
      ownerImage: owner.image,
      eventToken: selected.token,
      eventNumber: selected.number,
      eventCreatedAt: selected.createdAt,
      format: selected.format,
      rosterLimit: selected.rosterLimit,
      revealedAt: selected.revealedAt,
      eventCount,
      currentEventFormat: latest.format,
      currentEventRevealedAt: latest.revealedAt,
      currentEntrantCount: latestEntryCount,
      currentAcceptedCount: latestAcceptedCount,
      events: events.map(({ id: _id, leagueId: _leagueId, ...event }) => event),
      occupiedCount: entries.filter((entry) => entry.status !== 'rejected').length,
      entries: entries
        .filter((entry) => entry.status !== 'rejected' || entry.userId === viewerId)
        .map((entry) => {
          const profile = profiles.get(entry.userId)
          if (!profile) throw new Error(`League entrant ${entry.userId} is missing from D1`)
          return {
            userId: entry.userId,
            name: profile.name,
            image: profile.image,
            status: entry.status,
            joinedAt: entry.joinedAt,
            submitted: entry.rosterSnapshot !== null,
            rosterName: viewerId === entry.userId ? entry.rosterName : null,
            teamId: entry.teamId,
            requiredLimit: requiredLeagueRosterLimit(selected.format, selected.rosterLimit, entry.requiredLimit, entry.teamId),
            sealedLimit: selected.format === null && selected.revealedAt !== null ? this.frozenRosterLimit(entry.rosterSnapshot) : null,
          }
        }),
    }
  }

  joinLeague(token: string, userId: string, now: number, memberLimit: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'join', token, userId, now, memberLimit, eventToken: eventToken ?? '' },
      z.enum(['pending', 'accepted', 'rejected', 'missing', 'closed', 'full']),
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
      { op: 'moderate', token, ownerId, userId, status, memberLimit, eventToken: eventToken ?? '' },
      z.enum(['admitted', 'updated', 'missing', 'forbidden', 'closed', 'full']),
    )
  }

  assignLeagueRosterRequirement(token: string, ownerId: string, userId: string, requiredLimit: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'assign-limit', token, ownerId, userId, requiredLimit, eventToken: eventToken ?? '' },
      z.enum(['updated', 'missing', 'forbidden', 'closed', 'wrong-format', 'wrong-limit']),
    )
  }

  assignLeagueTeam(token: string, ownerId: string, userIds: readonly string[], teamId: string, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'assign-team', token, ownerId, userIds, teamId, eventToken: eventToken ?? '' },
      z.enum(['updated', 'missing', 'forbidden', 'closed', 'wrong-format']),
    )
  }

  submitLeagueRoster(input: Parameters<Repository['submitLeagueRoster']>[0]) {
    return this.product.leagueCommand(
      { ...input, op: 'submit', ownerId: input.userId, eventToken: input.eventToken ?? '', rosterLimit: input.rosterLimit ?? null },
      z.union([
        z.object({ outcome: z.literal('sealed'), format: z.enum(['1v1', '2v1', '2v2']).nullable(), requiredLimit: z.number().nullable() }),
        z.object({ outcome: z.enum(['missing', 'unassigned', 'wrong-limit']) }),
        z.object({ outcome: z.literal('invalid-warlords'), format: z.enum(['1v1', '2v1', '2v2']).nullable() }),
      ]),
    )
  }

  revealLeague(token: string, ownerId: string, now: number, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'reveal', token, ownerId, now, eventToken: eventToken ?? '' },
      z.union([
        z.object({ outcome: z.literal('revealed'), entrantIds: z.array(z.string()) }),
        z.object({ outcome: z.literal('not-ready') }),
        z.object({ outcome: z.literal('invalid-warlords'), format: z.enum(['1v1', '2v1', '2v2']) }),
      ]),
    )
  }

  unsealLeagueRoster(token: string, ownerId: string, userId: string, eventToken?: string) {
    return this.product.leagueCommand(
      { op: 'unseal', token, ownerId, userId, eventToken: eventToken ?? '' },
      z.enum(['unsealed', 'missing', 'forbidden', 'not-revealed']),
    )
  }

  async leagueRosters(token: string, userId: string, eventToken?: string, readerId?: string | null) {
    const rows = await this.product.leagueRosters(token, userId, eventToken, readerId)
    return rows.map(({ event, entry, reader }) => ({
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
    }))
  }

  async createLeagueBattle<T>(
    input: { id: string; token: string; leagueToken: string; eventToken?: string; userId: string; userIds: string[]; now: number },
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
    const record = await this.product.leagueByToken(input.leagueToken, input.eventToken)
    if (!record) return undefined
    const { selected: event } = record
    const entries = record.entries.filter(
      (entry) =>
        entry.status === 'accepted' && entry.rosterSnapshot !== null && (event.format === '2v2' || input.userIds.includes(entry.userId)),
    )
    const prepared = await prepare({
      eventToken: event.token,
      format: event.format,
      rosterLimit: event.rosterLimit,
      revealedAt: event.revealedAt,
      entries: entries.map((entry) => ({
        userId: entry.userId,
        requiredLimit: entry.requiredLimit,
        snapshot: entry.rosterSnapshot,
        teamId: entry.teamId,
      })),
    })
    const created = await this.product.leagueCommand(
      {
        op: 'create-battle',
        token: input.leagueToken,
        ownerId: input.userId,
        eventToken: event.token,
        id: input.id,
        battleToken: input.token,
        userId: input.userId,
        allyIds: prepared.allyIds,
        opponentIds: prepared.opponentIds,
        initialCommands: prepared.initialCommands,
        now: input.now,
        expectedLatest: !input.eventToken,
        expectedEntries: entries.map((entry) => ({ userId: entry.userId, snapshot: entry.rosterSnapshot! })),
      },
      z.boolean(),
    )
    return created ? prepared.result : undefined
  }

  saveRoster(...args: Parameters<Repository['saveRoster']>) {
    return this.product.saveRoster(...args)
  }

  rostersByUser(...args: Parameters<Repository['rostersByUser']>) {
    return this.product.rostersByUser(...args)
  }

  publicRostersByUser(...args: Parameters<Repository['publicRostersByUser']>) {
    return this.product.publicRostersByUser(...args)
  }

  rosterSummariesByUser(...args: Parameters<Repository['rosterSummariesByUser']>) {
    return this.product.rosterSummariesByUser(...args)
  }

  roster(...args: Parameters<Repository['roster']>) {
    return this.product.roster(...args)
  }

  setRosterVisibility(...args: Parameters<Repository['setRosterVisibility']>) {
    return this.product.setRosterVisibility(...args)
  }

  collectionByUser(...args: Parameters<Repository['collectionByUser']>) {
    return this.product.collectionByUser(...args)
  }

  addToCollection(...args: Parameters<Repository['addToCollection']>) {
    return this.product.addToCollection(...args)
  }

  removeFromCollection(...args: Parameters<Repository['removeFromCollection']>) {
    return this.product.removeFromCollection(...args)
  }

  favouriteFactionsByUser(...args: Parameters<Repository['favouriteFactionsByUser']>) {
    return this.product.favouriteFactionsByUser(...args)
  }

  addFavouriteFaction(...args: Parameters<Repository['addFavouriteFaction']>) {
    return this.product.addFavouriteFaction(...args)
  }

  removeFavouriteFaction(...args: Parameters<Repository['removeFavouriteFaction']>) {
    return this.product.removeFavouriteFaction(...args)
  }

  favouriteDetachmentsByUser(...args: Parameters<Repository['favouriteDetachmentsByUser']>) {
    return this.product.favouriteDetachmentsByUser(...args)
  }

  addFavouriteDetachment(...args: Parameters<Repository['addFavouriteDetachment']>) {
    return this.product.addFavouriteDetachment(...args)
  }

  removeFavouriteDetachment(...args: Parameters<Repository['removeFavouriteDetachment']>) {
    return this.product.removeFavouriteDetachment(...args)
  }

  deleteRoster(...args: Parameters<Repository['deleteRoster']>) {
    return this.product.deleteRoster(...args)
  }

  async createBattle(...args: Parameters<Repository['createBattle']>) {
    await this.product.createBattle(...args)
  }

  deleteBattle(...args: Parameters<Repository['deleteBattle']>) {
    return this.product.deleteBattle(...args)
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
    const profiles = await this.accounts.profilesByIds(snapshot.seats.map((seat) => seat.id))
    return {
      battle: snapshot.battle,
      players: snapshot.seats.map((seat) => {
        const profile = profiles.get(seat.id)
        if (!profile) throw new Error(`Battle seat ${seat.id} is missing from D1`)
        return { ...profile, side: seat.side, automated: seat.automated }
      }),
    }
  }

  private async battleHistory(snapshot: Snapshot): Promise<BattleHistory> {
    return { ...(await this.battleSeats(snapshot)), log: snapshot.log }
  }

  private async feed(input: Parameters<SpacetimeOperator['battleFeed']>[0]) {
    const page = await this.product.battleFeed(input)
    const profiles = await this.accounts.profilesByIds(page.battles.flatMap((row) => row.seats.map((seat) => seat.id)))
    const battles = page.battles.map((row) => ({
      battle: row.battle,
      at: row.at,
      players: row.seats.map((seat) => {
        const profile = profiles.get(seat.id)
        if (!profile) throw new Error(`Battle seat ${seat.id} is missing from D1`)
        return { ...profile, side: seat.side, automated: seat.automated }
      }),
      log: row.log,
    }))
    return { battles, nextCursor: page.nextCursor }
  }

  async battlesByUser(userId: string, page?: { limit: number; before?: BattlesCursor; withUserId?: string }) {
    return this.feed({ scope: 'user', userId, withUserId: page?.withUserId, before: page?.before, limit: page?.limit ?? 500 })
  }

  async battlesByLeagueEvent(leagueToken: string, eventToken: string, page: { limit: number; before?: BattlesCursor }) {
    return this.feed({ scope: 'league', leagueToken, eventToken, before: page.before, limit: page.limit })
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

  battleAudiences(...args: Parameters<Repository['battleAudiences']>) {
    return this.product.battleAudiences(...args)
  }

  battleAudience(...args: Parameters<Repository['battleAudience']>) {
    return this.product.battleAudience(...args)
  }

  setBattleAudience(...args: Parameters<Repository['setBattleAudience']>) {
    return this.product.setBattleAudience(...args)
  }

  shareBattle(...args: Parameters<Repository['shareBattle']>) {
    return this.product.shareBattle(...args)
  }

  log(...args: Parameters<Repository['log']>) {
    return this.product.log(...args)
  }

  submit(...args: Parameters<Repository['submit']>) {
    return this.product.submit(...args)
  }
}
