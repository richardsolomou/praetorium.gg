import { createFileRoute } from '@tanstack/react-router'
import { referenceRobots } from '../server/referenceDiscovery'

export const Route = createFileRoute('/robots.txt')({
  server: { handlers: { GET: ({ request }) => referenceRobots(request) } },
})
