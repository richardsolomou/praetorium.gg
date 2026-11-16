import packageJson from '../../package.json' with { type: 'json' }
import { deploymentHost, reportsToTelemetry, serverEventContext } from '../adapters/posthog'
import { globalSingleton } from '../lib/globalSingleton'
import { createTelemetry } from './telemetry'

/**
 * The server's PostHog telemetry, created on first use and shared by every bundle; it sends nothing outside production.
 * The Nitro plugin in `shutdown.ts` shuts it down once the server has drained.
 */
export const serverTelemetry = () =>
  globalSingleton(SERVER_TELEMETRY, () => {
    const host = deploymentHost()
    return createTelemetry(reportsToTelemetry ? process.env : {}, {
      serviceVersion: packageJson.version,
      resourceAttributes: host ? { 'deployment.host': host } : {},
      beforeSend: serverEventContext(host),
    })
  })

export const SERVER_TELEMETRY = 'praetorium.posthog'

type FailureRecord = { event: string; error?: unknown } & Record<string, unknown>

/** Logs a failure no request is waiting on and reports it by its event name, leaving the detail in the server log. */
export function reportServerFailure(record: FailureRecord, severity: 'warn' | 'error' = 'error') {
  if (severity === 'warn') console.warn(record)
  else console.error(record)
  if (!reportsToTelemetry) return
  const attributes = { job: record.event, error_type: record.error instanceof Error ? record.error.name : 'none' }
  const telemetry = serverTelemetry()
  telemetry.log(severity, record.event, attributes)
  telemetry.posthog.metrics.count('server.background.failures', 1, { attributes })
}

export function countServerMetric(name: string, attributes: Record<string, string | number>) {
  if (reportsToTelemetry) serverTelemetry().posthog.metrics.count(name, 1, { attributes })
}

export function withServerSpan<T>(name: string, work: () => Promise<T>): Promise<T> {
  return reportsToTelemetry ? serverTelemetry().posthog.withSpan(name, () => work()) : work()
}
