import { createFileRoute } from '@tanstack/react-router'
import { referenceDocumentResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/documents/$id')({
  server: { handlers: { GET: ({ request, params }) => referenceDocumentResponse(request, params.id) } },
})
