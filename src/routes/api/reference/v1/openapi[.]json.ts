import { createFileRoute } from '@tanstack/react-router'
import { referenceOpenApi } from '../../../../server/referenceOpenApi'

export const Route = createFileRoute('/api/reference/v1/openapi.json')({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json(referenceOpenApi(request), {
          headers: { 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'application/vnd.oai.openapi+json' },
        }),
    },
  },
})
