import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { healthResponse } from '../../server/health'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const response = await healthResponse(
          async () => {
            await app().ready()
            await app().health()
          },
          () => ({ code: 'database_unavailable', message: 'database unavailable' }),
        )
        const revision = process.env.GITHUB_SHA?.trim()
        if (response.ok && revision) response.headers.set('x-praetorium-revision', revision)
        return response
      },
    },
  },
})
