import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'

/** better-auth owns everything under here. */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => app().auth.handler(request),
      POST: ({ request }) => app().auth.handler(request),
    },
  },
})
