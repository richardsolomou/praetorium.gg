import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/realtime/mode')({
  server: {
    handlers: {
      GET: ({ request }) =>
        process.env.SPACETIME_DATABASE
          ? Response.json({
              mode: 'spacetime',
              database: process.env.SPACETIME_DATABASE,
              uri: new URL('/spacetime/', request.url).toString(),
            })
          : new Response('SpacetimeDB is not configured', { status: 503 }),
    },
  },
})
