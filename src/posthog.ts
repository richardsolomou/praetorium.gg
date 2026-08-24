import { definePostHogCoverage } from 'ras-stack/posthog'
import type { PostHogConfig } from 'posthog-js'

// EasyList/EasyPrivacy block the literal /ingest path regardless of host; vite.config.ts's
// postHogIngestProxy and __root.tsx's PostHogIntegration must both route through this same path.
export const POSTHOG_INGEST_PATH = '/t'

export const POSTHOG_BROWSER_OPTIONS = {
  capture_exceptions: true,
  capture_performance: true,
  disable_conversations: true,
  mask_personal_data_properties: true,
  custom_personal_data_properties: ['token'],
} satisfies Partial<PostHogConfig> & { disable_conversations: boolean }

export const postHogCoverage = definePostHogCoverage({
  browser: { analytics: true, errorTracking: true, featureFlags: true, identity: true, sessionReplay: true },
  server: { analytics: true, errorTracking: true, logs: true },
  sourceMaps: { disabled: 'source-map upload requires a deployment personal API key' },
})
