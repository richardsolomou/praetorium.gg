import type { OnboardingProgress } from '../core/onboarding'

/**
 * Builds that still offered skipping a task crash on an answer without `skippedTasks`. A saved offline copy keeps its
 * build, with no expiry, until a later online visit replaces it; remove this once production stops reporting
 * `skippedTasks is not iterable` from those builds.
 */
export const onboardingAnswer = (progress: OnboardingProgress) => ({ ...progress, skippedTasks: [] as [] })
