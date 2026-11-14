import { createFileRoute } from '@tanstack/react-router'
import { serviceStatus } from '../../server/serviceStatus'

export const Route = createFileRoute('/api/status')({
  server: {
    handlers: { GET: async () => Response.json(await serviceStatus(), { headers: { 'cache-control': 'no-store' } }) },
  },
})
