import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { app } from '../../server/app'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => {
        try {
          app().database.get(sql`SELECT 1`)
          return Response.json({ ok: true })
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : 'health check failed' }, { status: 503 })
        }
      },
    },
  },
})
