import { createMiddleware, createStart } from '@tanstack/react-start'
import { canonicalHostMiddleware, serverFunctionIdentityMiddleware } from 'ras-stack/tanstack/middleware'
import { serverTelemetry } from './adapters/posthog'
import { crawlerRequestEvent } from './server/crawlerRequests'
import { sharedPageCache } from './server/sharedPageCache'
import { pendingWriteMiddleware } from './client/pendingWrites'

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

/** Lets Cloudflare hold signed-out reference pages briefly; its cache rule bypasses any request with a session. */
const sharedPageCacheMiddleware = createMiddleware({ type: 'request' }).server(async ({ request, next }) => {
  const result = await next()
  const cacheControl = sharedPageCache(request, result.response)
  if (cacheControl) result.response.headers.set('Cache-Control', cacheControl)
  return result
})

export const startInstance = createStart(() => ({
  // Names each server function on its trace span and request metrics.
  functionMiddleware: [serverFunctionIdentityMiddleware(), pendingWriteMiddleware],
  requestMiddleware: [
    canonicalHostMiddleware(() => ({
      canonicalUrl: process.env.APP_URL,
      pathsServedOnAnyHost: new Set(['/api/health']),
    })),
    crawlerRequestMiddleware,
    sharedPageCacheMiddleware,
  ],
}))
