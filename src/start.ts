import { createStart } from '@tanstack/react-start'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [
    canonicalHostMiddleware(() => ({
      canonicalUrl: process.env.APP_URL,
      pathsServedOnAnyHost: new Set(['/api/health']),
    })),
  ],
}))
