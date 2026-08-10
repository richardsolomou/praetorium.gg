import { globalSingleton } from 'ras-stack/server'
import { postHogEnvironment } from 'ras-stack/posthog'
import { createManagedPostHogServerTelemetry, installPostHogServerTelemetryShutdown } from 'ras-stack/posthog/server'

export const serverTelemetry = () =>
  globalSingleton('praetorium.posthog', () => {
    const telemetry = createManagedPostHogServerTelemetry({
      environment: postHogEnvironment({
        projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN,
        host: process.env.VITE_POSTHOG_HOST,
      }),
      serviceName: 'praetorium',
      deploymentEnvironment: process.env.NODE_ENV,
      onError: (error) => console.error({ event: 'telemetry_failed', error }),
    })
    if (!process.env.VITEST) installPostHogServerTelemetryShutdown(telemetry)
    void telemetry.start()
    return telemetry
  })
