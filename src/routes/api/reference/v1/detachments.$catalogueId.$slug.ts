import { createFileRoute } from '@tanstack/react-router'
import { referenceDetachmentResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/detachments/$catalogueId/$slug')({
  server: { handlers: { GET: ({ request, params }) => referenceDetachmentResponse(request, params.catalogueId, params.slug) } },
})
