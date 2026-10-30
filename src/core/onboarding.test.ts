import { expect, it } from 'vitest'
import {
  onboardingComplete,
  type OnboardingFacts,
  onboardingProgress,
  onboardingTaskIds,
  resolvedGettingStartedTasks,
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

it('finishes getting started without requiring social play or reference tours', () => {
  expect(onboardingComplete({ welcomed: true, completedTasks: ['roster', 'simulator'], skippedTasks: [] })).toBe(true)
})

it('counts building and importing as the same getting-started goal', () => {
  expect(resolvedGettingStartedTasks({ welcomed: true, completedTasks: ['roster', 'roster-tools'], skippedTasks: [] })).toEqual(['roster'])
})

it('does not count an import walkthrough without an army', () => {
  expect(resolvedGettingStartedTasks({ welcomed: true, completedTasks: ['roster-tools'], skippedTasks: [] })).toEqual([])
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

it('does not complete a task the player has not done because storage says so', () => {
  const stored: StoredOnboarding = { welcomed: false, tasks: [{ task: 'roster', state: 'completed' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).completedTasks).toEqual([])
})

it('keeps onboarding available while the first matchup is unresolved', () => {
  expect(
    onboardingComplete({
      completedTasks: ['roster', 'friend', 'battle'],
      skippedTasks: ['league', 'reference'],
      welcomed: true,
    }),
  ).toBe(false)
})
