import { createFileRoute } from '@tanstack/react-router'
import { databaseHealthFailure } from 'ras-stack/server'
import { tanStackHealthHandler } from 'ras-stack/tanstack/server'
import { app } from '../../server/app'

const readiness = tanStackHealthHandler(
  async () => {
    await app().ready()
    await app().health()
  },
  { failure: databaseHealthFailure },
)

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const response = await readiness()
        const revision = process.env.GITHUB_SHA?.trim()
        if (response.ok && revision) response.headers.set('x-praetorium-revision', revision)
        return response
      },
    },
  },
})
