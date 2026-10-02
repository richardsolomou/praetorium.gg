import { createMiddleware, createStart } from '@tanstack/react-start'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/middleware'
import { serverTelemetry } from './adapters/posthog'
import { crawlerRequestEvent } from './server/crawlerRequests'

/** Records public page reads as `$http_log`, after the response is ready so the capture never delays it. */
const crawlerRequestMiddleware = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  const result = await next()
  const event = crawlerRequestEvent(request, result.response.status)
  if (event)
    void serverTelemetry()
      .capture(event.distinctId, '$http_log', event.properties)
      .catch((error: unknown) => console.error({ event: 'telemetry_failed', error }))
  return result
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    canonicalHostMiddleware(() => ({
      canonicalUrl: process.env.APP_URL,
      pathsServedOnAnyHost: new Set(['/api/health']),
    })),
    crawlerRequestMiddleware,
  ],
}))
