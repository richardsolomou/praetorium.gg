import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: { analytics: true, errorTracking: true, featureFlags: true, identity: true, sessionReplay: true },
  server: { analytics: true, errorTracking: true, logs: { disabled: 'application logs stay local until a server log sink is selected' } },
  sourceMaps: { disabled: 'source-map upload requires a deployment personal API key' },
})
