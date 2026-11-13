import { createRouter, type AnyRoute } from '@tanstack/react-router'
import type { PostHogServerTelemetry } from 'ras-stack/posthog/server'
import { requestOutcome } from './adapters/posthog'

/** Long enough that only a stalled render or a queue behind one crosses it, and well under the browser's 10 s release check. */
const SLOW_MS = 5_000

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

/** Names a path by the route that serves it, such as `/battles/$token`, so a recorded request never carries an id or token. */
export function routePatterns(routeTree: AnyRoute) {
  const router = createRouter({ routeTree })
  return (pathname: string) => {
    const leaf = router.matchRoutes(pathname, {}).at(-1)
    return !leaf || leaf.routeId === '__root__' ? 'unmatched' : leaf.fullPath
  }
}

type RequestRecord = { method: string; route: string; status: number; durationMs: number }
type RequestTelemetry = { metrics: Pick<PostHogServerTelemetry['metrics'], 'count' | 'histogram'>; log: PostHogServerTelemetry['log'] }

/** Counts and times a request, and logs it when it was slow or the server failed it, which is the only per-request record kept. */
export function recordRequest(telemetry: RequestTelemetry, { method, route, status, durationMs }: RequestRecord) {
  const attributes = { method: METHODS.has(method) ? method : 'other', route, ...requestOutcome(status) }
  void telemetry.metrics.count('http_server.requests', 1, { attributes })
  void telemetry.metrics.histogram('http_server.duration', durationMs, { unit: 'ms', attributes })
  if (status >= 500 || durationMs >= SLOW_MS)
    void telemetry.log({
      body: status >= 500 ? 'request failed' : 'slow request',
      severityText: 'warn',
      attributes: { ...attributes, status, duration_ms: Math.round(durationMs) },
    })
}
