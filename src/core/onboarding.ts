export const onboardingTaskIds = [
  'roster',
  'friend',
  'battle',
  'tournament',
  'reference',
  'community',
  'simulator',
  'roster-tools',
] as const

export type OnboardingTaskId = (typeof onboardingTaskIds)[number]

/** Tours that only a finished walkthrough can complete; every other task is folded from what the player has actually done. */
export const tourTaskIds = ['reference', 'community', 'simulator', 'roster-tools'] as const

type TourTaskId = (typeof tourTaskIds)[number]

const factTaskIds = ['roster', 'friend', 'battle', 'tournament'] as const

/** What the rest of the database already says the player has done. */
export type OnboardingFacts = Record<(typeof factTaskIds)[number], boolean>

/** The only onboarding state worth keeping: a finished tour. Storage also holds `skipped` rows, which count for nothing. */
export type StoredOnboarding = { tasks: readonly { task: string; state: 'completed' | 'skipped' }[] }

export type OnboardingProgress = { completedTasks: OnboardingTaskId[] }

export const EMPTY_ONBOARDING_PROGRESS: OnboardingProgress = { completedTasks: [] }

export type OnboardingProgressOperation = { operation: 'complete'; task: TourTaskId }

export function isTourTask(task: OnboardingTaskId): task is TourTaskId {
  return (tourTaskIds as readonly string[]).includes(task)
}

/**
 * The one fold. A task is complete because the player did the thing, not because
 * something remembered to say so; only a tour, which leaves no trace anywhere
 * else, is completed by storage. Task ids a later release invented are ignored.
 */
export function onboardingProgress(stored: StoredOnboarding, facts: OnboardingFacts): OnboardingProgress {
  const completed = new Set<OnboardingTaskId>(factTaskIds.filter((task) => facts[task]))
  for (const row of stored.tasks) {
    const task = onboardingTaskIds.find((known) => known === row.task)
    if (task && row.state === 'completed' && isTourTask(task)) completed.add(task)
  }
  return { completedTasks: onboardingTaskIds.filter((task) => completed.has(task)) }
}
