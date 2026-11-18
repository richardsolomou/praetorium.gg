import { forwarding } from './area'

/** Battle results, ratings, leaderboards and achievements. */
export const withStandings = forwarding([
  'currentStandingsView',
  'achievementFacts',
  'claimStandingsRefresh',
  'saveBattleResults',
  'battleResultsAfter',
  'ratingsBefore',
  'saveRatingSteps',
  'finishStandingsRefresh',
  'leaderboard',
  'playerStandings',
  'ratingChanges',
  'battleResultsByUser',
  'achievementStatus',
  'saveAchievements',
  'markAchievementsSeen',
  'syncAchievementDefinitions',
])
