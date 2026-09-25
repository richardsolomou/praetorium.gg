import { and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, isNull, lt, ne, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { AdminUserPage, AdminUsersCursor } from '../../admin'
import {
  EMPTY_ONBOARDING_PROGRESS,
  onboardingProgress as foldOnboardingProgress,
  type OnboardingProgress,
  type OnboardingProgressOperation,
} from '../../core/onboarding'
import type { PraetoriumDatabase } from '../connection'
import {
  account,
  battleUsers,
  friendInvites,
  friendships,
  leagueEventEntries,
  leagues,
  practiceOpponents,
  rosters,
  user,
  userOnboarding,
  userOnboardingTasks,
} from '../schema'
export type UnlinkAccountResult =
  | { status: 'removed'; account: { accessToken: string | null; refreshToken: string | null } }
  | { status: 'missing' | 'two-factor' | 'last-method' }

const ADMIN_USERS_PAGE_SIZE = 50
const PLAYER_SEARCH_LIMIT = 20

type AccountTransaction = Parameters<Parameters<PraetoriumDatabase['transaction']>[0]>[0]

async function lockFriendshipPair(tx: AccountTransaction, leftId: string, rightId: string) {
  const pair = JSON.stringify([leftId, rightId].toSorted())
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${pair}, 4021970614))`)
}

/** A typed name matched anywhere in a stored one, with the wildcards the player typed left as literals. */
function contains(query: string) {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export class AccountRepository {
  constructor(private readonly database: PraetoriumDatabase) {}

  async userById(id: string) {
    const [row] = await this.database.select().from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  /**
   * What the guide should show, asked of the rows the product already writes.
   *
   * One query answers every derived task at once and carries the welcome back
   * with it; the second reads the handful of rows only the player could have
   * written. Nothing here is a stored copy of a fact, so an account that predates
   * the guide arrives with its history already counted.
   */
  async onboardingProgress(userId: string): Promise<OnboardingProgress> {
    const anyRow = { one: sql`1` }
    const [[row], tasks] = await Promise.all([
      this.database
        .select({
          welcomed: userOnboarding.welcomed,
          roster: sql<boolean>`${exists(
            this.database
              .select(anyRow)
              .from(rosters)
              .where(and(eq(rosters.userId, userId), ne(rosters.picks, '[]'))),
          )}`,
          friend: sql<boolean>`${exists(
            this.database
              .select(anyRow)
              .from(friendships)
              .where(and(isNotNull(friendships.acceptedAt), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))),
          )}`,
          battle: sql<boolean>`${exists(this.database.select(anyRow).from(battleUsers).where(eq(battleUsers.userId, userId)))}`,
          league: sql<boolean>`${or(
            exists(this.database.select(anyRow).from(leagues).where(eq(leagues.ownerId, userId))),
            exists(this.database.select(anyRow).from(leagueEventEntries).where(eq(leagueEventEntries.userId, userId))),
          )}`,
        })
        .from(user)
        .leftJoin(userOnboarding, eq(userOnboarding.userId, user.id))
        .where(eq(user.id, userId)),
      this.database
        .select({ task: userOnboardingTasks.task, state: userOnboardingTasks.state })
        .from(userOnboardingTasks)
        .where(eq(userOnboardingTasks.userId, userId)),
    ])
    if (!row) return EMPTY_ONBOARDING_PROGRESS
    return foldOnboardingProgress({ welcomed: row.welcomed ?? false, tasks }, row)
  }

  /**
   * One row written the way the player left it. Every operation is idempotent and
   * addresses a single primary key, so repeating one or racing two needs no lock.
   */
  async updateOnboardingProgress(userId: string, operation: OnboardingProgressOperation): Promise<OnboardingProgress> {
    if (operation.operation === 'welcome') {
      await this.database
        .insert(userOnboarding)
        .values({ userId, welcomed: true })
        .onConflictDoUpdate({ target: userOnboarding.userId, set: { welcomed: true } })
    } else if (operation.operation === 'restore') {
      await this.database
        .delete(userOnboardingTasks)
        .where(
          and(
            eq(userOnboardingTasks.userId, userId),
            eq(userOnboardingTasks.task, operation.task),
            eq(userOnboardingTasks.state, 'skipped'),
          ),
        )
    } else {
      const state = operation.operation === 'complete' ? 'completed' : 'skipped'
      await this.database
        .insert(userOnboardingTasks)
        .values({ userId, task: operation.task, state })
        .onConflictDoUpdate({ target: [userOnboardingTasks.userId, userOnboardingTasks.task], set: { state } })
    }
    return this.onboardingProgress(userId)
  }

  async adminUsers(input: { query?: string; cursor?: AdminUsersCursor | null; limit?: number } = {}): Promise<AdminUserPage> {
    const limit = Math.min(Math.max(input.limit ?? ADMIN_USERS_PAGE_SIZE, 1), 100)
    const query = input.query?.trim()
    const conditions = [
      notExists(
        this.database.select({ id: practiceOpponents.userId }).from(practiceOpponents).where(eq(practiceOpponents.userId, user.id)),
      ),
    ]
    if (query) conditions.push(or(ilike(user.name, contains(query)), ilike(user.email, contains(query)))!)
    if (input.cursor) {
      conditions.push(
        or(lt(user.createdAt, input.cursor.createdAt), and(eq(user.createdAt, input.cursor.createdAt), lt(user.id, input.cursor.id)))!,
      )
    }
    const rows = await this.database
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        banned: user.banned,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(and(...conditions))
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit + 1)
    const users = rows.slice(0, limit)
    if (!users.length) return { users: [], nextCursor: null }
    const ids = users.map(({ id }) => id)
    const [rosterCounts, battleCounts, methods] = await Promise.all([
      this.database
        .select({ userId: rosters.userId, count: count() })
        .from(rosters)
        .where(inArray(rosters.userId, ids))
        .groupBy(rosters.userId),
      this.database
        .select({ userId: battleUsers.userId, count: count() })
        .from(battleUsers)
        .where(inArray(battleUsers.userId, ids))
        .groupBy(battleUsers.userId),
      this.database.select({ userId: account.userId, providerId: account.providerId }).from(account).where(inArray(account.userId, ids)),
    ])
    const rosterCountByUser = new Map(rosterCounts.map((row) => [row.userId, row.count]))
    const battleCountByUser = new Map(battleCounts.map((row) => [row.userId, row.count]))
    const methodsByUser = new Map<string, Set<string>>()
    for (const method of methods) {
      const providers = methodsByUser.get(method.userId) ?? new Set<string>()
      providers.add(method.providerId)
      methodsByUser.set(method.userId, providers)
    }
    const entries = users.map((entry) => ({
      ...entry,
      rosterCount: rosterCountByUser.get(entry.id) ?? 0,
      battleCount: battleCountByUser.get(entry.id) ?? 0,
      signInMethods: [...(methodsByUser.get(entry.id) ?? [])].sort((left, right) => left.localeCompare(right)),
    }))
    const last = users.at(-1)!
    return { users: entries, nextCursor: rows.length > limit ? { createdAt: last.createdAt, id: last.id } : null }
  }

  async unlinkAccount(userId: string, providerId: string, availableProviders: readonly string[]): Promise<UnlinkAccountResult> {
    return this.database.transaction(async (tx) => {
      const [owner] = await tx.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)).for('update')
      const methods = await tx.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId))
      if (!methods.some((method) => method.providerId === providerId)) return { status: 'missing' }
      if (providerId === 'credential' && owner?.twoFactorEnabled) return { status: 'two-factor' }
      const available = new Set(availableProviders)
      if (!methods.some((method) => method.providerId !== providerId && available.has(method.providerId))) return { status: 'last-method' }
      const [removed] = await tx
        .delete(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
        .returning({ accessToken: account.accessToken, refreshToken: account.refreshToken })
      return removed ? { status: 'removed', account: removed } : { status: 'missing' }
    })
  }

  async profileByUserId(id: string) {
    const [row] = await this.database.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  /** Names for many ids at once, so a friend list is one query rather than one per row. */
  async namesByIds(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string }>()
    const rows = await this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, [...new Set(ids)]))
    return new Map(rows.map((row) => [row.id, row]))
  }

  /**
   * Players matching a typed name that this one has no relationship with yet.
   *
   * The name, the exclusions and the bound are all the database's: reading every
   * account to filter it afterwards costs the whole user table to answer a
   * question about twenty rows, and grows with the instance.
   */
  async searchPlayers(userId: string, query: string) {
    const relationship = this.database
      .select({ one: sql`1` })
      .from(friendships)
      .where(
        or(
          and(eq(friendships.requesterId, userId), eq(friendships.addresseeId, user.id)),
          and(eq(friendships.addresseeId, userId), eq(friendships.requesterId, user.id)),
        ),
      )
    const practice = this.database
      .select({ one: sql`1` })
      .from(practiceOpponents)
      .where(eq(practiceOpponents.userId, user.id))
    // A practice opponent is nobody to befriend: it is offered as a seat, not a player.
    return this.database
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(and(ne(user.id, userId), ilike(user.name, contains(query)), notExists(relationship), notExists(practice)))
      .orderBy(asc(user.name))
      .limit(PLAYER_SEARCH_LIMIT)
  }

  /** The practice opponents this instance seats, in the order they are offered. */
  async practiceOpponents() {
    return this.database
      .select({ id: user.id, name: user.name, image: user.image })
      .from(practiceOpponents)
      .innerJoin(user, eq(user.id, practiceOpponents.userId))
      .orderBy(asc(user.id))
  }

  /**
   * Every relationship this player is in, with the other party already named.
   *
   * The name comes from the join rather than a second lookup keyed on the ids
   * this query just returned, which is the same answer for one round trip.
   */
  async relationships(userId: string) {
    const other = alias(user, 'other')
    return this.database
      .select({
        requesterId: friendships.requesterId,
        addresseeId: friendships.addresseeId,
        acceptedAt: friendships.acceptedAt,
        otherId: other.id,
        otherName: other.name,
        otherImage: other.image,
      })
      .from(friendships)
      .innerJoin(other, or(eq(other.id, friendships.requesterId), eq(other.id, friendships.addresseeId)))
      .where(and(ne(other.id, userId), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId))))
      .orderBy(asc(other.name))
  }

  /**
   * A request in either direction already answers this, so the pair is checked
   * before it is written. The primary key refuses a repeat of the same direction;
   * the mirrored pair is a different key, so it cannot be left to an upsert.
   */
  async requestFriend(requesterId: string, addresseeId: string, now: number) {
    return this.database.transaction(async (tx) => {
      await lockFriendshipPair(tx, requesterId, addresseeId)
      const [existing] = await tx
        .select({ requesterId: friendships.requesterId })
        .from(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId)),
            and(eq(friendships.requesterId, addresseeId), eq(friendships.addresseeId, requesterId)),
          ),
        )
        .limit(1)
      if (existing) return false
      await tx.insert(friendships).values({ requesterId, addresseeId, requestedAt: now })
      return true
    })
  }

  async acceptFriend(requesterId: string, addresseeId: string, now: number) {
    return this.database.transaction(async (tx) => {
      await lockFriendshipPair(tx, requesterId, addresseeId)
      const updated = await tx
        .update(friendships)
        .set({ acceptedAt: now })
        .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId), isNull(friendships.acceptedAt)))
        .returning({ requesterId: friendships.requesterId })
      return updated.length > 0
    })
  }

  async rejectFriend(requesterId: string, addresseeId: string) {
    return this.database.transaction(async (tx) => {
      await lockFriendshipPair(tx, requesterId, addresseeId)
      const removed = await tx
        .delete(friendships)
        .where(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, addresseeId), isNull(friendships.acceptedAt)))
        .returning({ requesterId: friendships.requesterId })
      return removed.length > 0
    })
  }

  async removeFriend(leftId: string, rightId: string) {
    return this.database.transaction(async (tx) => {
      await lockFriendshipPair(tx, leftId, rightId)
      const removed = await tx
        .delete(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, leftId), eq(friendships.addresseeId, rightId)),
            and(eq(friendships.requesterId, rightId), eq(friendships.addresseeId, leftId)),
          ),
        )
        .returning({ requesterId: friendships.requesterId })
      return removed.length > 0
    })
  }

  async friendInviteByInviter(inviterId: string) {
    const [invite] = await this.database
      .select({ token: friendInvites.token })
      .from(friendInvites)
      .where(eq(friendInvites.inviterId, inviterId))
      .limit(1)
    return invite ?? null
  }

  async friendInviteByToken(token: string) {
    const [invite] = await this.database
      .select({
        token: friendInvites.token,
        inviterId: user.id,
        inviterName: user.name,
        inviterImage: user.image,
      })
      .from(friendInvites)
      .innerJoin(user, eq(user.id, friendInvites.inviterId))
      .where(eq(friendInvites.token, token))
      .limit(1)
    return invite ?? null
  }

  async replaceFriendInvite(inviterId: string, token: string, now: number) {
    await this.database
      .insert(friendInvites)
      .values({ inviterId, token, createdAt: now })
      .onConflictDoUpdate({ target: friendInvites.inviterId, set: { token, createdAt: now } })
  }

  async cancelFriendInvite(inviterId: string) {
    const removed = await this.database
      .delete(friendInvites)
      .where(eq(friendInvites.inviterId, inviterId))
      .returning({ token: friendInvites.token })
    return removed.length > 0
  }

  async acceptFriendInvite(token: string, recipientId: string, now: number) {
    return this.database.transaction(async (tx) => {
      const [invite] = await tx
        .select({ inviterId: friendInvites.inviterId })
        .from(friendInvites)
        .where(eq(friendInvites.token, token))
        .for('update')
      if (!invite) return 'missing' as const
      if (invite.inviterId === recipientId) return 'self' as const

      await lockFriendshipPair(tx, invite.inviterId, recipientId)
      const [relationship] = await tx
        .select({ requesterId: friendships.requesterId, addresseeId: friendships.addresseeId, acceptedAt: friendships.acceptedAt })
        .from(friendships)
        .where(
          or(
            and(eq(friendships.requesterId, invite.inviterId), eq(friendships.addresseeId, recipientId)),
            and(eq(friendships.requesterId, recipientId), eq(friendships.addresseeId, invite.inviterId)),
          ),
        )
        .limit(1)
      if (relationship?.acceptedAt !== null && relationship?.acceptedAt !== undefined) return 'already-friends' as const

      if (relationship) {
        await tx
          .update(friendships)
          .set({ acceptedAt: now })
          .where(
            and(
              eq(friendships.requesterId, relationship.requesterId),
              eq(friendships.addresseeId, relationship.addresseeId),
              isNull(friendships.acceptedAt),
            ),
          )
      } else {
        await tx.insert(friendships).values({ requesterId: invite.inviterId, addresseeId: recipientId, requestedAt: now, acceptedAt: now })
      }
      await tx.delete(friendInvites).where(eq(friendInvites.token, token))
      return { inviterId: invite.inviterId }
    })
  }
}
