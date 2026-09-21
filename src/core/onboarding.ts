export const onboardingTaskIds = ['roster', 'friend', 'battle'] as const

export type OnboardingTaskId = (typeof onboardingTaskIds)[number]

export type OnboardingTask = {
  id: OnboardingTaskId
  title: string
  description: string
  prerequisites: readonly OnboardingTaskId[]
}

export const onboardingTasks: readonly OnboardingTask[] = [
  {
    id: 'roster',
    title: 'Build your first army',
    description: 'Create a roster, choose its faction and detachment, then add the units you want to field.',
    prerequisites: [],
  },
  {
    id: 'friend',
    title: 'Add someone you play with',
    description: 'Find another player by account name. Once they accept, you can seat them in a battle.',
    prerequisites: [],
  },
  {
    id: 'battle',
    title: 'Start a battle',
    description: 'Choose the players at the table, then work through armies, mission, deployment, and first turn together.',
    prerequisites: ['roster', 'friend'],
  },
]

export type OnboardingProgress = {
  completedTasks: OnboardingTaskId[]
  skippedTasks: OnboardingTaskId[]
  welcomed: boolean
}

export type OnboardingProgressOperation = { operation: 'complete' | 'skip' | 'restore'; task: OnboardingTaskId } | { operation: 'welcome' }

export const EMPTY_ONBOARDING_PROGRESS: OnboardingProgress = { completedTasks: [], skippedTasks: [], welcomed: false }

export function normalizeOnboardingTasks(tasks: string[]): OnboardingTaskId[] {
  const known = new Set<string>(onboardingTaskIds)
  return [...new Set(tasks)].filter((task): task is OnboardingTaskId => known.has(task))
}

export function availableOnboardingTasks(progress: OnboardingProgress) {
  const resolved = new Set([...progress.completedTasks, ...progress.skippedTasks])
  return onboardingTasks.filter((task) => resolved.has(task.id) || task.prerequisites.every((prerequisite) => resolved.has(prerequisite)))
}

export function applyOnboardingProgressOperation(current: OnboardingProgress, operation: OnboardingProgressOperation): OnboardingProgress {
  if (operation.operation === 'welcome') return { ...current, welcomed: true }
  const completed = new Set(current.completedTasks)
  const skipped = new Set(current.skippedTasks)
  if (operation.operation === 'complete') {
    completed.add(operation.task)
    skipped.delete(operation.task)
  } else if (operation.operation === 'skip') {
    if (!completed.has(operation.task)) skipped.add(operation.task)
  } else {
    skipped.delete(operation.task)
  }
  return { ...current, completedTasks: [...completed], skippedTasks: [...skipped] }
}
