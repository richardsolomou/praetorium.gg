import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/realtime/mode')({
  server: {
    handlers: {
      GET: () => Response.json({ mode: process.env.SPACETIME_URL ? 'spacetime' : 'centrifugo' }),
    },
  },
})
