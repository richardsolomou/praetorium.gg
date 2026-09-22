import { createFileRoute } from '@tanstack/react-router'
import { referenceRecordResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/records/$id')({
  server: { handlers: { GET: ({ request, params }) => referenceRecordResponse(request, params.id) } },
})
