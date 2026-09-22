import { createFileRoute } from '@tanstack/react-router'
import { referenceDatasheetResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/datasheets/$catalogueId/$slug')({
  server: { handlers: { GET: ({ request, params }) => referenceDatasheetResponse(request, params.catalogueId, params.slug) } },
})
