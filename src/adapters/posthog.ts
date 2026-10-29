import { version } from '../../package.json'
import type { BeforeSendFn } from 'posthog-node'
import { globalSingleton } from 'ras-stack/server'
import { postHogEnvironment } from 'ras-stack/posthog'
import { createManagedPostHogServerTelemetry, installPostHogServerTelemetryShutdown } from 'ras-stack/posthog/server'

/** The host readers use for this deployment, which separates production from previews and local stacks. */
export function deploymentHost(appUrl = process.env.APP_URL) {
  return appUrl ? URL.parse(appUrl)?.host : undefined
}

/** Only a deployed instance reports to the shared telemetry project. */
export const reportsToTelemetry = process.env.NODE_ENV === 'production'

/** Server exceptions carry no source-map release, so they name the build they came from instead. */
export function serverEventContext(host: string | undefined): BeforeSendFn {
  return (event) => {
    if (!event) return event
    const properties = {
      ...event.properties,
      ...(host ? { $host: host } : {}),
      ...(event.event === '$exception' ? { app_version: version } : {}),
    }
    return { ...event, properties }
  }
}

export const serverTelemetry = () =>
  globalSingleton('praetorium.posthog', () => {
    const host = deploymentHost()
    const telemetry = createManagedPostHogServerTelemetry({
      environment: postHogEnvironment({
        projectToken: process.env.VITE_POSTHOG_PROJECT_TOKEN,
        host: process.env.VITE_POSTHOG_HOST,
      }),
      serviceName: 'praetorium-server',
      serviceVersion: version,
      deploymentEnvironment: process.env.NODE_ENV,
      resourceAttributes: host ? { 'deployment.host': host } : {},
      clientOptions: { before_send: serverEventContext(host) },
      onError: (error) => console.error({ event: 'telemetry_failed', error }),
    })
    if (!process.env.VITEST) installPostHogServerTelemetryShutdown(telemetry)
    void telemetry.start()
    return telemetry
  })

type FailureRecord = { event: string; error?: unknown } & Record<string, unknown>

/** Logs a failure no request is waiting on and reports it by its event name, leaving the detail in the server log. */
export function reportServerFailure(record: FailureRecord, severity: 'warn' | 'error' = 'error') {
  if (severity === 'warn') console.warn(record)
  else console.error(record)
  if (!reportsToTelemetry) return
  const attributes = { job: record.event, error_type: record.error instanceof Error ? record.error.name : 'none' }
  const telemetry = serverTelemetry()
  void telemetry.log({ body: record.event, severityText: severity, attributes })
  void telemetry.metrics.count('server.background.failures', 1, { attributes })
}

/** Bounded attributes for an outbound request: no status means it never got an answer. */
export function requestOutcome(status?: number) {
  if (status === undefined) return { outcome: 'failed', status_class: 'none' }
  return { outcome: status < 400 ? 'success' : status < 500 ? 'refused' : 'error', status_class: `${Math.floor(status / 100)}xx` }
}

export function countServerMetric(name: string, attributes: Record<string, string | number>) {
  if (reportsToTelemetry) void serverTelemetry().metrics.count(name, 1, { attributes })
}

export function withServerSpan<T>(name: string, work: () => Promise<T>): Promise<T> {
  return reportsToTelemetry ? serverTelemetry().withSpan(name, () => work()) : work()
}
