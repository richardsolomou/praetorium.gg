import type { SpacetimeOperator } from '../spacetimeOperator'
import { type RepositoryBase } from './area'

/** Battle results, ratings, leaderboards and achievements. */
export function withStandings<B extends RepositoryBase>(Base: B) {
  return class StandingsRepository extends Base {
    achievementFacts(...args: Parameters<SpacetimeOperator['achievementFacts']>) {
      return this.product.achievementFacts(...args)
    }

    claimStandingsRefresh(...args: Parameters<SpacetimeOperator['claimStandingsRefresh']>) {
      return this.product.claimStandingsRefresh(...args)
    }

    saveBattleResults(...args: Parameters<SpacetimeOperator['saveBattleResults']>) {
      return this.product.saveBattleResults(...args)
    }

    battleResultsAfter(...args: Parameters<SpacetimeOperator['battleResultsAfter']>) {
      return this.product.battleResultsAfter(...args)
    }

    ratingsBefore(...args: Parameters<SpacetimeOperator['ratingsBefore']>) {
      return this.product.ratingsBefore(...args)
    }

    saveRatingSteps(...args: Parameters<SpacetimeOperator['saveRatingSteps']>) {
      return this.product.saveRatingSteps(...args)
    }

    finishStandingsRefresh(...args: Parameters<SpacetimeOperator['finishStandingsRefresh']>) {
      return this.product.finishStandingsRefresh(...args)
    }

    leaderboard(...args: Parameters<SpacetimeOperator['leaderboard']>) {
      return this.product.leaderboard(...args)
    }

    playerStandings(...args: Parameters<SpacetimeOperator['playerStandings']>) {
      return this.product.playerStandings(...args)
    }

    ratingChanges(...args: Parameters<SpacetimeOperator['ratingChanges']>) {
      return this.product.ratingChanges(...args)
    }

    battleResultsByUser(...args: Parameters<SpacetimeOperator['battleResultsByUser']>) {
      return this.product.battleResultsByUser(...args)
    }

    achievementStatus(...args: Parameters<SpacetimeOperator['achievementStatus']>) {
      return this.product.achievementStatus(...args)
    }

    saveAchievements(...args: Parameters<SpacetimeOperator['saveAchievements']>) {
      return this.product.saveAchievements(...args)
    }

    markAchievementsSeen(...args: Parameters<SpacetimeOperator['markAchievementsSeen']>) {
      return this.product.markAchievementsSeen(...args)
    }

    syncAchievementDefinitions(...args: Parameters<SpacetimeOperator['syncAchievementDefinitions']>) {
      return this.product.syncAchievementDefinitions(...args)
    }
  }
}
