import { createFileRoute } from '@tanstack/react-router'
import { referenceSearchResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/search')({
  server: { handlers: { GET: ({ request }) => referenceSearchResponse(request) } },
})
