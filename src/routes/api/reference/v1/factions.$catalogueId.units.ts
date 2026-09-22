import { createFileRoute } from '@tanstack/react-router'
import { referenceUnitsResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/factions/$catalogueId/units')({
  server: { handlers: { GET: ({ request, params }) => referenceUnitsResponse(request, params.catalogueId) } },
})
