import { expect, it } from 'vitest'
import {
  availableOnboardingTasks,
  EMPTY_ONBOARDING_PROGRESS,
  onboardingComplete,
  type OnboardingFacts,
  onboardingProgress,
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

it('withholds the battle task until a list and a friend exist', () => {
  expect(availableOnboardingTasks(EMPTY_ONBOARDING_PROGRESS)).not.toContain('battle')
})

it('offers the battle task once its preparation is resolved either way', () => {
  const progress = onboardingProgress({ welcomed: false, tasks: [{ task: 'friend', state: 'skipped' }] }, { ...NOTHING_DONE, roster: true })

  expect(availableOnboardingTasks(progress)).toContain('battle')
})

it('finishes onboarding when every task is completed or skipped', () => {
  expect(
    onboardingComplete({
      completedTasks: ['roster', 'friend', 'battle'],
      skippedTasks: ['league', 'reference', 'community'],
      welcomed: true,
    }),
  ).toBe(true)
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
