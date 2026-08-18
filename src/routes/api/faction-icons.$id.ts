import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'

export const Route = createFileRoute('/api/faction-icons/$id')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const icon = app().rules()?.factionIcons.get(params.id)
        if (!icon) return new Response('Not found', { status: 404 })
        const encoded = icon.match(/^data:image\/svg\+xml;base64,(.+)$/)?.[1]
        if (!encoded) return Response.redirect(icon, 307)
        return new Response(Buffer.from(encoded, 'base64'), {
          headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': 'image/svg+xml' },
        })
      },
    },
  },
})
