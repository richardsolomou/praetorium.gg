import { z } from 'zod'
import { achievementFactsSchema, achievementStatusSchema } from '../../contracts/achievements'
import type { SpacetimeBase } from './client'

/** Earned achievements and the facts that award them. */
export function withAchievements<B extends SpacetimeBase>(Base: B) {
  return class AchievementOperations extends Base {
    async achievementStatus(userId: string) {
      return this.read('achievement_status', [userId], achievementStatusSchema)
    }

    async saveAchievements(input: {
      userId: string
      revision: number
      definitions: string
      earned: { achievementId: string; earnedAt: number | null }[]
    }) {
      return this.reply('save_achievements', [JSON.stringify(input)], z.boolean())
    }

    async markAchievementsSeen(userId: string, achievementIds: readonly string[]) {
      return this.reply('mark_achievements_seen', [userId, [...achievementIds]], z.boolean())
    }

    async syncAchievementDefinitions(version: string) {
      return this.reply('sync_achievement_definitions', [version], z.boolean())
    }

    async achievementFacts(userId: string) {
      return this.read('achievement_facts_by_user', [userId], achievementFactsSchema)
    }
  }
}
