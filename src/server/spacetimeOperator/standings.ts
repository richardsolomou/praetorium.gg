import { z } from 'zod'
import {
  leaderboardSchema,
  playerStandingsSchema,
  standingStepSchema,
  storedBattleResultSchema,
  type StandingStep,
} from '../../contracts/battleResults'
import type { SpacetimeBase } from './client'

const revision = z.number().int().nonnegative()

/** Battle results, ratings and the standings refresh that folds them. */
export function withStandings<B extends SpacetimeBase>(Base: B) {
  return class StandingsOperations extends Base {
    async claimStandingsRefresh(holder: string, results: string, ratings: string) {
      return this.read(
        'claim_standings_refresh',
        [holder, results, ratings],
        z.discriminatedUnion('state', [
          z.object({ state: z.literal('fresh'), standings: revision }),
          z.object({ state: z.literal('busy'), standings: revision }),
          z.object({
            state: z.literal('claimed'),
            cursor: revision,
            ratingsFrom: revision.nullable(),
            replays: revision,
            standings: revision,
          }),
        ]),
      )
    }

    async saveBattleResults(input: { holder: string; results: z.input<typeof storedBattleResultSchema>[]; removed: string[] }) {
      return this.read(
        'save_battle_results',
        [JSON.stringify(input)],
        z.object({ ratingsFrom: revision.nullable(), replays: revision, changed: z.boolean() }),
      )
    }

    async battleResultsAfter(afterAt: number, afterId: string, limit: number) {
      return this.read('battle_results_after', [afterAt, afterId, limit], z.array(storedBattleResultSchema))
    }

    async ratingsBefore(from: number, playerIds: readonly string[]) {
      return this.read('ratings_before', [from, [...playerIds]], z.array(standingStepSchema))
    }

    async saveRatingSteps(input: { holder: string; from: number; first: boolean; steps: StandingStep[] }) {
      return this.reply('save_rating_steps', [JSON.stringify(input)], z.literal(true))
    }

    async finishStandingsRefresh(input: {
      holder: string
      cursor: number
      seen: number
      results: string
      ratings: string
      replayed: boolean
      replays: number
      changed: boolean
    }) {
      const { holder, cursor, seen, results, ratings, replayed, replays, changed } = input
      return this.reply('finish_standings_refresh', [holder, cursor, seen, results, ratings, replayed, replays, changed], z.string())
    }

    async leaderboard(activeSince: number, limit: number) {
      return this.read('leaderboard', [activeSince, limit], leaderboardSchema)
    }

    async playerStandings(userId: string, activeSince: number) {
      return this.read('player_standings', [userId, activeSince], playerStandingsSchema)
    }

    async ratingChanges(tokens: readonly string[]) {
      return this.read(
        'rating_changes',
        [[...tokens]],
        z.array(z.object({ token: z.string(), changes: z.record(z.string(), z.number().int()) })),
      )
    }

    async battleResultsByUser(userId: string) {
      return this.read('battle_results_by_user', [userId], z.array(storedBattleResultSchema))
    }
  }
}
