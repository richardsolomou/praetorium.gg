import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { healthResponse } from 'ras-stack/server'
import { app } from '../../server/app'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () =>
        healthResponse(() => app().database.get(sql`SELECT 1`), {
          errorMessage: (error) => (error instanceof Error ? error.message : 'health check failed'),
        }),
    },
  },
})
