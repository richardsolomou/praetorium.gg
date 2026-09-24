import { and, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { DEFAULT_PUSH_NOTIFICATIONS, PUSH_TOKENS_PER_USER } from '../../core/notifications'
import type { PraetoriumDatabase } from '../connection'
import { leagues, practiceOpponents, pushPreferences, pushTokens } from '../schema'

export class NotificationRepository {
  constructor(private readonly database: PraetoriumDatabase) {}

  async pushEnabled(userId: string) {
    const [row] = await this.database
      .select({ enabled: pushPreferences.enabled })
      .from(pushPreferences)
      .where(eq(pushPreferences.userId, userId))
      .limit(1)
    return row?.enabled ?? DEFAULT_PUSH_NOTIFICATIONS
  }

  async setPushEnabled(userId: string, enabled: boolean, now: number) {
    await this.database
      .insert(pushPreferences)
      .values({ userId, enabled, at: now })
      .onConflictDoUpdate({ target: pushPreferences.userId, set: { enabled, at: now } })
    return enabled
  }

  /**
   * Bind a device to the account signed in on it.
   *
   * The upsert and the trim share a transaction, so a player who registers many
   * devices at once still ends with the bound rather than above it.
   */
  async registerPushToken(input: { userId: string; token: string; platform: 'ios' | 'android'; now: number }) {
    await this.database.transaction(async (tx) => {
      await tx
        .insert(pushTokens)
        .values({ token: input.token, userId: input.userId, platform: input.platform, createdAt: input.now, lastSeenAt: input.now })
        .onConflictDoUpdate({
          target: pushTokens.token,
          set: { userId: input.userId, platform: input.platform, lastSeenAt: input.now },
        })
      const kept = tx
        .select({ token: pushTokens.token })
        .from(pushTokens)
        .where(eq(pushTokens.userId, input.userId))
        .orderBy(desc(pushTokens.lastSeenAt), desc(pushTokens.token))
        .limit(PUSH_TOKENS_PER_USER)
      await tx.delete(pushTokens).where(and(eq(pushTokens.userId, input.userId), notInArray(pushTokens.token, kept)))
    })
  }

  /** Forget a device, but only for the account that holds it. */
  async unregisterPushToken(userId: string, token: string) {
    await this.database.delete(pushTokens).where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)))
  }

  /** Forget devices the push service reports gone, whoever held them. */
  async deletePushTokens(tokens: readonly string[]) {
    if (!tokens.length) return
    await this.database.delete(pushTokens).where(inArray(pushTokens.token, [...new Set(tokens)]))
  }

  /**
   * The devices that may be sent a notice for these players.
   *
   * A player who turned notifications off has none, and neither does a practice
   * opponent: nobody signs in to one, so a token held by one can only be a mistake.
   */
  async pushTargets(userIds: readonly string[]) {
    if (!userIds.length) return []
    return this.database
      .select({ userId: pushTokens.userId, token: pushTokens.token })
      .from(pushTokens)
      .leftJoin(pushPreferences, eq(pushPreferences.userId, pushTokens.userId))
      .leftJoin(practiceOpponents, eq(practiceOpponents.userId, pushTokens.userId))
      .where(
        and(
          inArray(pushTokens.userId, [...new Set(userIds)]),
          isNull(practiceOpponents.userId),
          sql`coalesce(${pushPreferences.enabled}, ${DEFAULT_PUSH_NOTIFICATIONS})`,
        ),
      )
  }

  async leagueNames(tokens: readonly string[]) {
    if (!tokens.length) return new Map<string, string>()
    const rows = await this.database
      .select({ token: leagues.token, name: leagues.name })
      .from(leagues)
      .where(inArray(leagues.token, [...new Set(tokens)]))
    return new Map(rows.map((row) => [row.token, row.name]))
  }
}
