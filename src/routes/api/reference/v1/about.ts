import { createFileRoute } from '@tanstack/react-router'
import { referenceGuideResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/about')({
  server: { handlers: { GET: ({ request }) => referenceGuideResponse(request) } },
})
