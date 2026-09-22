import { createFileRoute } from '@tanstack/react-router'
import { referenceIndexResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/')({
  server: { handlers: { GET: ({ request }) => referenceIndexResponse(request) } },
})
