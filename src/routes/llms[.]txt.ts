import { createFileRoute } from '@tanstack/react-router'
import { referenceLlms } from '../server/referenceDiscovery'

export const Route = createFileRoute('/llms.txt')({
  server: { handlers: { GET: ({ request }) => referenceLlms(request) } },
})
