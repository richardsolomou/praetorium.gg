import { z } from 'zod'
import { onboardingProgress as foldOnboardingProgress, type OnboardingProgressOperation } from '../../core/onboarding'
import type { SpacetimeBase } from './client'

const friendship = z.object({ requesterId: z.string(), addresseeId: z.string(), acceptedAt: z.number().int().nullable() })
const productStat = z.object({
  userId: z.string(),
  rosterCount: z.number().int().nonnegative(),
  battleCount: z.number().int().nonnegative(),
  tournamentCount: z.number().int().nonnegative(),
  friendCount: z.number().int().nonnegative(),
  practiceOpponent: z.boolean(),
})
const invite = z.object({ token: z.string(), inviterId: z.string() })
const acceptedInvite = z.union([z.enum(['missing', 'self', 'already-friends']), z.object({ inviterId: z.string() })])
const onboarding = z.object({
  tasks: z.array(z.object({ task: z.string(), state: z.enum(['completed', 'skipped']) })),
  facts: z.object({ roster: z.boolean(), friend: z.boolean(), battle: z.boolean(), tournament: z.boolean() }),
})

/** Friends, friend invites, practice opponents and onboarding. */
export function withSocial<B extends SpacetimeBase>(Base: B) {
  return class SocialOperations extends Base {
    async friendshipsByUser(userId: string) {
      return this.read('friendships_by_user', [userId], z.array(friendship))
    }

    async productStats(userIds: readonly string[]) {
      if (!userIds.length) return new Map<string, z.infer<typeof productStat>>()
      const rows = await this.read('product_stats', [[...new Set(userIds)]], z.array(productStat))
      return new Map(rows.map((row) => [row.userId, row]))
    }

    async practiceOpponentIds() {
      return this.read('practice_opponent_ids', [], z.array(z.string()))
    }

    async registerPracticeOpponent(userId: string) {
      await this.call('register_practice_opponent', [userId])
    }

    async requestFriend(requesterId: string, addresseeId: string, now: number) {
      return this.reply('request_friend', [requesterId, addresseeId, now], z.boolean())
    }

    async acceptFriend(requesterId: string, addresseeId: string, now: number) {
      return this.reply('accept_friend', [requesterId, addresseeId, now], z.boolean())
    }

    async rejectFriend(requesterId: string, addresseeId: string) {
      return this.reply('reject_friend', [requesterId, addresseeId], z.boolean())
    }

    async removeFriend(leftId: string, rightId: string) {
      return this.reply('remove_friend', [leftId, rightId], z.boolean())
    }

    async friendInviteByInviter(inviterId: string) {
      return this.read('friend_invite_by_inviter', [inviterId], z.string().nullable())
    }

    async friendInviteByToken(token: string) {
      return this.read('friend_invite_by_token', [token], invite.nullable())
    }

    async replaceFriendInvite(inviterId: string, token: string, now: number) {
      await this.call('replace_friend_invite', [inviterId, token, now])
    }

    async cancelFriendInvite(inviterId: string) {
      return this.reply('cancel_friend_invite', [inviterId], z.boolean())
    }

    async acceptFriendInvite(token: string, recipientId: string, now: number) {
      return this.read('accept_friend_invite', [token, recipientId, now], acceptedInvite)
    }

    async shareBattle(userId: string, otherId: string) {
      return this.reply('share_battle', [userId, otherId], z.boolean())
    }

    async onboardingProgress(userId: string) {
      const stored = await this.read('onboarding_by_user', [userId], onboarding)
      return foldOnboardingProgress(stored, stored.facts)
    }

    async updateOnboardingProgress(userId: string, operation: OnboardingProgressOperation) {
      const stored = await this.read('update_onboarding', [userId, operation.operation, operation.task], onboarding)
      return foldOnboardingProgress(stored, stored.facts)
    }
  }
}
