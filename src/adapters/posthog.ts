import { version } from '../../package.json'
import type { BeforeSendFn } from 'posthog-node'

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

/** Bounded attributes for an outbound request: no status means it never got an answer. */
export function requestOutcome(status?: number) {
  if (status === undefined) return { outcome: 'failed', status_class: 'none' }
  return { outcome: status < 400 ? 'success' : status < 500 ? 'refused' : 'error', status_class: `${Math.floor(status / 100)}xx` }
}
