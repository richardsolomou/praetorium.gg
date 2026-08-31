import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { appleNotificationResponse } from '../../server/appleAuth'

export const Route = createFileRoute('/api/apple-notifications')({
  server: {
    handlers: {
      POST: ({ request }) => appleNotificationResponse(request, (subject) => app().auth.deleteAppleAccount(subject)),
    },
  },
})
