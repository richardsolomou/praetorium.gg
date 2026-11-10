import { createFileRoute } from '@tanstack/react-router'
import { posthogSupportTickets } from '../../adapters/posthogSupport'
import { app } from '../../server/app'
import { supportReplyResponse } from '../../server/supportReplies'

/** Called by the PostHog Workflow that runs on each public reply to a Support ticket. */
export const Route = createFileRoute('/api/support-replies')({
  server: {
    handlers: {
      POST: ({ request }) => {
        const readTicket = posthogSupportTickets()
        const delivery = app().email
        const appUrl = process.env.APP_URL
        const secret = process.env.SUPPORT_REPLY_WEBHOOK_SECRET
        // An instance that does not tell players about replies answers as if the route did not exist.
        if (!readTicket || !delivery || !appUrl || !secret) return new Response(null, { status: 404 })
        return supportReplyResponse(request, {
          secret,
          readTicket,
          account: async (id) => {
            const user = await app().service.userById(id)
            return user ? { name: user.name, email: user.email } : null
          },
          send: (email) => delivery.send(email),
          appUrl,
        })
      },
    },
  },
})
