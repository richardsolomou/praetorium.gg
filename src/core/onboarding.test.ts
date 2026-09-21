import { describe, expect, it } from 'vitest'
import {
  applyOnboardingProgressOperation,
  availableOnboardingTasks,
  EMPTY_ONBOARDING_PROGRESS,
  normalizeOnboardingTasks,
  type OnboardingProgress,
} from './onboarding'

describe('onboarding', () => {
  it('offers the battle task after its preparation tasks are resolved', () => {
    const progress: OnboardingProgress = { ...EMPTY_ONBOARDING_PROGRESS, completedTasks: ['roster'], skippedTasks: ['friend'] }

    expect(availableOnboardingTasks(progress).map((task) => task.id)).toEqual(['roster', 'friend', 'battle'])
  })

  it('completing a skipped task makes it complete instead', () => {
    const progress: OnboardingProgress = { ...EMPTY_ONBOARDING_PROGRESS, skippedTasks: ['roster'] }

    expect(applyOnboardingProgressOperation(progress, { operation: 'complete', task: 'roster' })).toEqual({
      completedTasks: ['roster'],
      skippedTasks: [],
      welcomed: false,
    })
  })

  it('keeps only unique tasks this release understands', () => {
    expect(normalizeOnboardingTasks(['friend', 'future-task', 'friend', 'roster'])).toEqual(['friend', 'roster'])
  })
})
