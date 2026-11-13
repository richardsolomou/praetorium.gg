import { z } from 'zod'
import type { PushPlatform } from '../../core/notificationConfig'
import { type Notice, noticeSubjectSchema, type WebPushSubscription } from '../../core/notifications'
import type { SpacetimeBase } from './client'

const pushTarget = z.object({ userId: z.string(), token: z.string() })
const webPushTarget = z.object({ userId: z.string(), endpoint: z.string(), p256dh: z.string(), auth: z.string() })
const storedNotice = noticeSubjectSchema.and(
  z.object({
    id: z.string(),
    actorId: z.string(),
    subjectName: z.string().optional(),
    at: z.number().int(),
    readAt: z.number().int().nullable(),
  }),
)

export function withNotifications<B extends SpacetimeBase>(Base: B) {
  return class NotificationOperations extends Base {
    async pushEnabled(userId: string) {
      return this.reply('push_enabled', [userId], z.boolean())
    }

    async setPushEnabled(userId: string, enabled: boolean, now: number) {
      return this.reply('set_push_enabled', [userId, enabled, now], z.boolean())
    }

    async registerPushToken(input: { userId: string; token: string; platform: PushPlatform; now: number }) {
      await this.call('register_push_token', [input.userId, input.token, input.platform, input.now])
    }

    async unregisterPushToken(userId: string, token: string) {
      await this.call('unregister_push_token', [userId, token])
    }

    async deletePushTokens(tokens: readonly string[]) {
      if (tokens.length) await this.call('delete_push_tokens', [[...new Set(tokens)]])
    }

    async pushTargets(userIds: readonly string[]) {
      if (!userIds.length) return []
      return this.read('push_targets', [[...new Set(userIds)]], z.array(pushTarget))
    }

    async registerWebPushSubscription(input: { userId: string; subscription: WebPushSubscription; now: number }) {
      const { endpoint, p256dh, auth } = input.subscription
      await this.call('register_web_push_subscription', [input.userId, endpoint, p256dh, auth, input.now])
    }

    async unregisterWebPushSubscription(userId: string, endpoint: string) {
      await this.call('unregister_web_push_subscription', [userId, endpoint])
    }

    async deleteWebPushSubscriptions(endpoints: readonly string[]) {
      if (endpoints.length) await this.call('delete_web_push_subscriptions', [[...new Set(endpoints)]])
    }

    async webPushTargets(userIds: readonly string[]) {
      if (!userIds.length) return []
      return this.read('web_push_targets', [[...new Set(userIds)]], z.array(webPushTarget))
    }

    /** Each notice's stored id by recipient, in the order given. */
    async storeNotices(notices: readonly (Notice & { subjectName?: string })[], now: number): Promise<Record<string, string>[]> {
      if (!notices.length) return []
      return this.read('store_notices', [JSON.stringify({ now, notices })], z.array(z.record(z.string(), z.string())))
    }

    async noticesByUser(userId: string, now: number) {
      return this.read('notices_by_user', [userId, now], z.array(storedNotice))
    }

    async markNoticesRead(userId: string, ids: readonly string[], now: number) {
      return this.reply('mark_notices_read', [userId, [...ids], now], z.boolean())
    }
  }
}
