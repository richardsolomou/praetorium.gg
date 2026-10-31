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

export const gettingStartedTaskIds = ['roster', 'simulator'] as const

/** Tours that only a finished walkthrough can complete; every other task is folded from what the player has actually done. */
export const tourTaskIds = ['reference', 'community', 'simulator', 'roster-tools'] as const

type TourTaskId = (typeof tourTaskIds)[number]

const factTaskIds = ['roster', 'friend', 'battle', 'tournament'] as const

/** What the rest of the database already says the player has done. */
export type OnboardingFacts = Record<(typeof factTaskIds)[number], boolean>

/** The only onboarding state worth keeping: a welcome, a finished tour, and a task the player waved away. */
export type StoredOnboarding = { welcomed: boolean; tasks: readonly { task: string; state: 'completed' | 'skipped' }[] }

export type OnboardingProgress = { completedTasks: OnboardingTaskId[]; skippedTasks: OnboardingTaskId[]; welcomed: boolean }

export const EMPTY_ONBOARDING_PROGRESS: OnboardingProgress = { completedTasks: [], skippedTasks: [], welcomed: false }

export type OnboardingProgressOperation =
  | { operation: 'complete'; task: TourTaskId }
  | { operation: 'skip' | 'restore'; task: OnboardingTaskId }
  | { operation: 'welcome' }

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
  const skipped = new Set<OnboardingTaskId>()
  for (const row of stored.tasks) {
    const task = onboardingTaskIds.find((known) => known === row.task)
    if (!task) continue
    if (row.state === 'skipped') skipped.add(task)
    else if (isTourTask(task)) completed.add(task)
  }
  return {
    completedTasks: onboardingTaskIds.filter((task) => completed.has(task)),
    skippedTasks: onboardingTaskIds.filter((task) => skipped.has(task) && !completed.has(task)),
    welcomed: stored.welcomed,
  }
}

export function onboardingComplete(progress: OnboardingProgress): boolean {
  return resolvedGettingStartedTasks(progress).length === gettingStartedTaskIds.length
}

export function resolvedGettingStartedTasks(progress: OnboardingProgress) {
  const resolved = new Set([...progress.completedTasks, ...progress.skippedTasks])
  return gettingStartedTaskIds.filter((task) => resolved.has(task))
}
