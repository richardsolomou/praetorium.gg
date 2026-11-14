import { createFileRoute } from '@tanstack/react-router'
import { calendarFeedText } from '../../core/calendarFeed'
import { tokenSchema } from '../../contracts/schemas'
import { app } from '../../server/app'
import { notFound } from '../../server/notFound'
import { publicOrigin } from '../../server/requestOrigin'

/** A player's calendar feed. The token is the only credential, since calendar apps fetch it without a session. */
export const Route = createFileRoute('/api/calendar/$token')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        // The app hands out the address with `.ics`, which some calendar apps look for before they subscribe.
        const parsed = tokenSchema.safeParse({ token: params.token.replace(/\.ics$/, '') })
        if (!parsed.success) return notFound()
        const dates = await app().repository.calendarFeed(parsed.data.token)
        if (!dates) return notFound()
        return new Response(calendarFeedText(dates, publicOrigin(request), Date.now()), {
          headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/calendar; charset=utf-8', 'X-Robots-Tag': 'noindex' },
        })
      },
    },
  },
})
