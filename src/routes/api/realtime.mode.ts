import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/realtime/mode')({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json(
          process.env.SPACETIME_URL && process.env.SPACETIME_DATABASE
            ? { mode: 'spacetime', database: process.env.SPACETIME_DATABASE, uri: new URL('/spacetime/', request.url).toString() }
            : { mode: 'centrifugo' },
        ),
    },
  },
})
