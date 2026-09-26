import { and, asc, desc, eq, exists, inArray, lt, ne, not, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/d1'
import { account, schema, user } from '../db/d1AuthSchema'
import type { UnlinkAccountResult } from '../db/repository'
import type { AdminUsersCursor } from '../admin'

function contains(query: string) {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export class D1AccountRepository {
  private readonly database: ReturnType<typeof drizzle<typeof schema>>

  constructor(binding: Parameters<typeof drizzle>[0]) {
    this.database = drizzle(binding, { schema })
  }

  async userById(id: string) {
    const [row] = await this.database.select().from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  async profileByUserId(id: string) {
    const [row] = await this.database.select({ id: user.id, name: user.name, image: user.image }).from(user).where(eq(user.id, id)).limit(1)
    return row
  }

  async namesByIds(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string }>()
    const rows = await this.database
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, [...new Set(ids)]))
    return new Map(rows.map((row) => [row.id, row]))
  }

  async profilesByIds(ids: readonly string[]) {
    if (!ids.length) return new Map<string, { id: string; name: string; image: string | null }>()
    const rows = await this.database
      .select({ id: user.id, name: user.name, image: user.image })
      .from(user)
      .where(inArray(user.id, [...new Set(ids)]))
    return new Map(rows.map((row) => [row.id, row]))
  }

  async adminUserRows(input: { query?: string; cursor?: AdminUsersCursor | null; limit?: number }, practiceIds: readonly string[]) {
    if (practiceIds.length > 100) throw new Error('Too many practice opponents')
    const limit = Math.min(Math.max(input.limit ?? 50, 1), 100)
    const query = input.query?.trim()
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
      .where(
        and(
          query
            ? or(
                sql`lower(${user.name}) like ${contains(query.toLowerCase())} escape '\\'`,
                sql`lower(${user.email}) like ${contains(query.toLowerCase())} escape '\\'`,
              )
            : undefined,
          input.cursor
            ? or(lt(user.createdAt, input.cursor.createdAt), and(eq(user.createdAt, input.cursor.createdAt), lt(user.id, input.cursor.id)))
            : undefined,
        ),
      )
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(limit + practiceIds.length + 1)
    const practice = new Set(practiceIds)
    const real = rows.filter((row) => !practice.has(row.id))
    const shown = real.slice(0, limit)
    const ids = shown.map((row) => row.id)
    const methods = ids.length
      ? await this.database
          .select({ userId: account.userId, providerId: account.providerId })
          .from(account)
          .where(inArray(account.userId, ids))
      : []
    const methodsByUser = new Map<string, Set<string>>()
    for (const method of methods) {
      const providers = methodsByUser.get(method.userId) ?? new Set<string>()
      providers.add(method.providerId)
      methodsByUser.set(method.userId, providers)
    }
    const last = shown.at(-1)
    return {
      users: shown.map((entry) => ({
        ...entry,
        signInMethods: [...(methodsByUser.get(entry.id) ?? [])].sort((left, right) => left.localeCompare(right)),
      })),
      nextCursor: real.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null,
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
