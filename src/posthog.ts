import { definePostHogCoverage } from 'ras-stack/posthog'

// EasyList/EasyPrivacy block the literal /ingest path regardless of host; vite.config.ts's
// postHogIngestProxy and __root.tsx's PostHogIntegration must both route through this same path.
export const POSTHOG_INGEST_PATH = '/t'

export const postHogCoverage = definePostHogCoverage({
  browser: { analytics: true, errorTracking: true, featureFlags: true, identity: true, sessionReplay: true },
  server: { analytics: true, errorTracking: true, logs: true },
  sourceMaps: { disabled: 'source-map upload requires a deployment personal API key' },
})
