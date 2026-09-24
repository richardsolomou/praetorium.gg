import { definePostHogCoverage } from 'ras-stack/posthog'
import type { PostHogConfig } from 'posthog-js'

export const POSTHOG_BROWSER_OPTIONS = {
  capture_exceptions: true,
  capture_performance: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['token'],
  session_recording: { maskAllInputs: true },
} satisfies Partial<PostHogConfig>

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    featureFlags: true,
    identity: true,
    logs: true,
    metrics: true,
    sessionReplay: true,
  },
  server: { analytics: true, errorTracking: true, logs: true, metrics: true, tracing: true },
  sourceMaps: true,
})
