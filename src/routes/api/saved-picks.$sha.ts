import { createFileRoute } from '@tanstack/react-router'
import { notFound } from '../../server/notFound'
import { savedPicksBytes, savedPicksPin } from '../../server/savedPicks'

/** The pinned saved-pick translations, for a device to verify against the pin it ships with; an address never changes content. */
export const Route = createFileRoute('/api/saved-picks/$sha')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        if (params.sha !== savedPicksPin.sha256) return notFound()
        return new Response(await savedPicksBytes(), {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
