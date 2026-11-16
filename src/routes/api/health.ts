import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { checkDependency, healthResponse } from '../../server/health'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const response = await healthResponse(async () => {
          const { ready, health } = app()
          await ready()
          await checkDependency('database_unavailable', 'database unavailable', health)
        })
        const revision = process.env.GITHUB_SHA?.trim()
        if (response.ok && revision) response.headers.set('x-praetorium-revision', revision)
        return response
      },
    },
  },
})
