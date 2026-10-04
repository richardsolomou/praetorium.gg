import { expect, it } from 'vitest'
import {
  availableOnboardingTasks,
  EMPTY_ONBOARDING_PROGRESS,
  onboardingComplete,
  type OnboardingFacts,
  onboardingProgress,
  onboardingTaskIds,
  tourTaskIds,
  type StoredOnboarding,
} from './onboarding'

const NOTHING_DONE: OnboardingFacts = { roster: false, friend: false, battle: false, league: false }
const NOTHING_STORED: StoredOnboarding = { welcomed: false, tasks: [] }

it('completes a task the player has already done', () => {
  const progress = onboardingProgress(NOTHING_STORED, { ...NOTHING_DONE, roster: true })

  expect(progress.completedTasks).toEqual(['roster'])
})

it('stops reporting a skip once the player does the thing anyway', () => {
  const stored: StoredOnboarding = { welcomed: false, tasks: [{ task: 'roster', state: 'skipped' }] }

  expect(onboardingProgress(stored, { ...NOTHING_DONE, roster: true }).skippedTasks).toEqual([])
})

it('keeps a skip of a task the player has not done', () => {
  const stored: StoredOnboarding = { welcomed: false, tasks: [{ task: 'league', state: 'skipped' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).skippedTasks).toEqual(['league'])
})

it('completes a tour nothing else records', () => {
  const stored: StoredOnboarding = { welcomed: false, tasks: [{ task: 'reference', state: 'completed' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).completedTasks).toEqual(['reference'])
})

it('ignores a stored task this release does not know', () => {
  const stored: StoredOnboarding = { welcomed: false, tasks: [{ task: 'painting', state: 'skipped' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).skippedTasks).toEqual([])
})

it('carries the welcome through the fold', () => {
  expect(onboardingProgress({ welcomed: true, tasks: [] }, NOTHING_DONE).welcomed).toBe(true)
})

it('withholds the battle task until army preparation is resolved', () => {
  expect(availableOnboardingTasks(EMPTY_ONBOARDING_PROGRESS)).not.toContain('battle')
})

it('offers a practice battle without a friendship', () => {
  const progress = onboardingProgress(NOTHING_STORED, { ...NOTHING_DONE, roster: true })

  expect(availableOnboardingTasks(progress)).toContain('battle')
})

it('finishes onboarding when every task is completed or skipped', () => {
  expect(
    onboardingComplete({
      completedTasks: ['roster', 'friend', 'battle'],
      skippedTasks: onboardingTaskIds.filter((task) => !['roster', 'friend', 'battle'].includes(task)),
      welcomed: true,
    }),
  ).toBe(true)
})

it.each(['simulator', 'roster-tools'] as const)('offers the new %s tour to an account that finished the original guide', (task) => {
  const progress = onboardingProgress(
    {
      welcomed: true,
      tasks: [
        { task: 'reference', state: 'completed' },
        { task: 'community', state: 'completed' },
      ],
    },
    { roster: true, friend: true, battle: true, league: true },
  )

  expect(availableOnboardingTasks(progress).filter((id) => !progress.completedTasks.includes(id))).toContain(task)
})

it.each(tourTaskIds)('records completion of the %s tour', (task) => {
  expect(onboardingProgress({ welcomed: true, tasks: [{ task, state: 'completed' }] }, NOTHING_DONE).completedTasks).toContain(task)
})

it('keeps onboarding available while any task is unresolved', () => {
  expect(
    onboardingComplete({
      completedTasks: ['roster', 'friend', 'battle'],
      skippedTasks: ['league', 'reference'],
      welcomed: true,
    }),
  ).toBe(false)
})
