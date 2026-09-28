import { createFileRoute } from '@tanstack/react-router'
import { spacetimePublicUri } from '../../server/spacetimePublicUri'

export const Route = createFileRoute('/api/realtime/mode')({
  server: {
    handlers: {
      GET: () =>
        process.env.SPACETIME_DATABASE
          ? Response.json({
              mode: 'spacetime',
              database: process.env.SPACETIME_DATABASE,
              uri: spacetimePublicUri(process.env.APP_URL),
            })
          : new Response('SpacetimeDB is not configured', { status: 503 }),
    },
  },
})
