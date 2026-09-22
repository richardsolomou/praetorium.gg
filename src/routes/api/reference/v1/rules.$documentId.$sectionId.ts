import { createFileRoute } from '@tanstack/react-router'
import { referenceRuleSectionResponse } from '../../../../server/referenceApi'

export const Route = createFileRoute('/api/reference/v1/rules/$documentId/$sectionId')({
  server: { handlers: { GET: ({ request, params }) => referenceRuleSectionResponse(request, params.documentId, params.sectionId) } },
})
