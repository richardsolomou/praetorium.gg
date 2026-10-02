import { and, asc, desc, eq, exists, inArray, isNull, lt, ne, not, notInArray, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { account, githubSponsor, schema, user } from '../db/authSchema'
import type { GithubSponsor } from './githubSponsors'
import type { AdminUserFilter, AdminUserSort, AdminUsersCursor } from '../admin'

type UnlinkAccountResult =
  | { status: 'removed'; account: { accessToken: string | null; refreshToken: string | null } }
  | { status: 'missing' | 'two-factor' | 'last-method' }

function contains(query: string) {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export class SqliteAccountRepository {
  private readonly database: LibSQLDatabase<typeof schema>

  constructor(database: LibSQLDatabase<typeof schema>) {
    this.database = database
  }

  async userById(id: string) {
    const [row] = await this.database.select().from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  async profileByUserId(id: string) {
    const [row] = await this.database.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  async isAdmin(id: string) {
    const [row] = await this.database.select({ role: user.role }).from(user).where(eq(user.id, id)).limit(1)
    return row?.role === 'admin'
  }

  async namesByIds(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string }>()
    const rows = await this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, [...new Set(ids)]))
    return new Map(rows.map((row) => [row.id, row]))
  }

  /** How the player's linked GitHub account sponsors the project, or null when it does not or none is linked. */
  async githubSponsorship(userId: string): Promise<'public' | 'private' | null> {
    const [row] = await this.database
      .select({ public: githubSponsor.public })
      .from(account)
      .innerJoin(githubSponsor, eq(githubSponsor.githubId, account.accountId))
      .where(and(eq(account.userId, userId), eq(account.providerId, 'github')))
      .limit(1)
    if (!row) return null
    return row.public ? 'public' : 'private'
  }

  async replaceGithubSponsors(sponsors: readonly GithubSponsor[]) {
    await this.database.transaction(async (transaction) => {
      await transaction.delete(githubSponsor)
      if (sponsors.length) await transaction.insert(githubSponsor).values([...sponsors])
    })
  }

  async profilesByIds(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string; image: string | null }>()
    const rows = await this.database
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(inArray(user.id, [...new Set(ids)]))
    return new Map(rows.map((row) => [row.id, row]))
  }

  async adminUserRows(
    input: { query?: string; sort?: AdminUserSort; filter?: AdminUserFilter; cursor?: AdminUsersCursor | null; limit?: number },
    practiceIds: readonly string[],
  ) {
    if (practiceIds.length > 100) throw new Error('Too many practice opponents')
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
    const query = input.query?.trim()
    const ordered = input.sort === 'seen' ? user.lastSeenAt : user.createdAt
    const cursor = input.cursor
    // Newest first with never-seen players last, which is where SQLite sorts a null in descending order.
    const after = cursor
      ? cursor.at
        ? or(lt(ordered, cursor.at), and(eq(ordered, cursor.at), lt(user.id, cursor.id)), isNull(ordered))
        : and(isNull(ordered), lt(user.id, cursor.id))
      : undefined
    const rows = await this.database
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
        lastSeenAt: user.lastSeenAt,
      })
      .from(user)
      .where(
        and(
          practiceIds.length ? notInArray(user.id, [...practiceIds]) : undefined,
          query
            ? or(
                sql`lower(${user.name}) like ${contains(query.toLowerCase())} escape '\\'`,
                sql`lower(${user.email}) like ${contains(query.toLowerCase())} escape '\\'`,
              )
            : undefined,
          input.filter === 'admins' ? eq(user.role, 'admin') : undefined,
          input.filter === 'no-two-factor' ? eq(user.twoFactorEnabled, false) : undefined,
          input.filter === 'unverified' ? eq(user.emailVerified, false) : undefined,
          after,
        ),
      )
      .orderBy(desc(ordered), desc(user.id))
      .limit(limit + 1)
    const shown = rows.slice(0, limit)
    const ids = shown.map((row) => row.id)
    const methods = ids.length
      ? await this.database
          .select({ userId: account.userId, providerId: account.providerId, linkedAt: account.createdAt })
          .from(account)
          .where(inArray(account.userId, ids))
          .orderBy(asc(account.createdAt))
      : []
    const methodsByUser = new Map<string, Map<string, Date>>()
    for (const method of methods) {
      const providers = methodsByUser.get(method.userId) ?? new Map<string, Date>()
      if (!providers.has(method.providerId)) providers.set(method.providerId, method.linkedAt)
      methodsByUser.set(method.userId, providers)
    }
    const last = shown.at(-1)
    return {
      users: shown.map((entry) => ({
        ...entry,
        signInMethods: [...(methodsByUser.get(entry.id) ?? [])].map(([providerId, linkedAt]) => ({ providerId, linkedAt })),
      })),
      nextCursor: rows.length > limit && last ? { at: input.sort === 'seen' ? last.lastSeenAt : last.createdAt, id: last.id } : null,
    }
  }

  async searchPlayerRows(userId: string, query: string, after: { name: string; id: string } | null, limit: number) {
    if (limit < 1 || limit > 100) throw new Error('Invalid player search limit')
    return this.database
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(
        and(
          ne(user.id, userId),
          sql`lower(${user.name}) like ${contains(query.toLowerCase())} escape '\\'`,
          after ? or(sql`${user.name} > ${after.name}`, and(eq(user.name, after.name), sql`${user.id} > ${after.id}`)) : undefined,
        ),
      )
      .orderBy(asc(user.name), asc(user.id))
      .limit(limit)
  }

  async unlinkAccount(userId: string, providerId: string, availableProviders: readonly string[]): Promise<UnlinkAccountResult> {
    const other = alias(account, 'other_account')
    const removable =
      availableProviders.length > 0 &&
      exists(
        this.database
          .select({ one: sql`1` })
          .from(other)
          .where(and(eq(other.userId, userId), ne(other.providerId, providerId), inArray(other.providerId, [...availableProviders]))),
      )
    if (removable) {
      const [removed] = await this.database
        .delete(account)
        .where(
          and(
            eq(account.userId, userId),
            eq(account.providerId, providerId),
            removable,
            providerId === 'credential'
              ? not(
                  exists(
                    this.database
                      .select({ one: sql`1` })
                      .from(user)
                      .where(and(eq(user.id, userId), eq(user.twoFactorEnabled, true))),
                  ),
                )
              : undefined,
          ),
        )
        .returning({ accessToken: account.accessToken, refreshToken: account.refreshToken })
      if (removed) return { status: 'removed', account: removed }
    }
    const [owner, methods] = await Promise.all([
      this.database.select({ twoFactorEnabled: user.twoFactorEnabled }).from(user).where(eq(user.id, userId)).limit(1),
      this.database.select({ providerId: account.providerId }).from(account).where(eq(account.userId, userId)),
    ])
    if (!methods.some((method) => method.providerId === providerId)) return { status: 'missing' }
    if (providerId === 'credential' && owner[0]?.twoFactorEnabled) return { status: 'two-factor' }
    return { status: 'last-method' }
  }
}
