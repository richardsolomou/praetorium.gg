import { version } from '../../package.json'
import type { BeforeSendFn } from 'posthog-node'
import { globalSingleton } from 'ras-stack/server'
import { postHogEnvironment } from 'ras-stack/posthog'
import { createManagedPostHogServerTelemetry, installPostHogServerTelemetryShutdown } from 'ras-stack/posthog/server'

/** The host readers use for this deployment, which separates production from previews and local stacks. */
export function deploymentHost(appUrl = process.env.APP_URL) {
  return appUrl ? URL.parse(appUrl)?.host : undefined
}

export function serverEventContext(host: string | undefined): BeforeSendFn {
  return (event) => (event && host ? { ...event, properties: { ...event.properties, $host: host } } : event)
}

export const serverTelemetry = () =>
  globalSingleton('praetorium.posthog', () => {
    const telemetry = createManagedPostHogServerTelemetry({
      environment: postHogEnvironment({
        projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN,
        host: process.env.VITE_POSTHOG_HOST,
      }),
      serviceName: 'praetorium',
      serviceVersion: version,
      deploymentEnvironment: process.env.NODE_ENV,
      clientOptions: { before_send: serverEventContext(deploymentHost()) },
      onError: (error) => console.error({ event: 'telemetry_failed', error }),
    })
    if (!process.env.VITEST) installPostHogServerTelemetryShutdown(telemetry)
    void telemetry.start()
    return telemetry
  })
