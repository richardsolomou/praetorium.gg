import { expect, it } from 'vitest'
import { type OnboardingFacts, onboardingProgress, type StoredOnboarding } from './onboarding'

const NOTHING_DONE: OnboardingFacts = { roster: false, friend: false, battle: false, tournament: false }
const NOTHING_STORED: StoredOnboarding = { tasks: [] }

it('completes a task the player has already done', () => {
  const progress = onboardingProgress(NOTHING_STORED, { ...NOTHING_DONE, roster: true })

  expect(progress.completedTasks).toEqual(['roster'])
})

it('completes a tour nothing else records', () => {
  const stored: StoredOnboarding = { tasks: [{ task: 'reference', state: 'completed' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).completedTasks).toEqual(['reference'])
})

it('does not complete a tour the player skipped', () => {
  const stored: StoredOnboarding = { tasks: [{ task: 'reference', state: 'skipped' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).completedTasks).toEqual([])
})

it('ignores a stored task this release does not know', () => {
  const stored: StoredOnboarding = { tasks: [{ task: 'painting', state: 'completed' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).completedTasks).toEqual([])
})

it('does not complete a task the player has not done because storage says so', () => {
  const stored: StoredOnboarding = { tasks: [{ task: 'roster', state: 'completed' }] }

  expect(onboardingProgress(stored, NOTHING_DONE).completedTasks).toEqual([])
})
