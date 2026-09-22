import { createFileRoute } from '@tanstack/react-router'
import { referenceFactionsResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/factions')({
  server: { handlers: { GET: ({ request }) => referenceFactionsResponse(request) } },
})
