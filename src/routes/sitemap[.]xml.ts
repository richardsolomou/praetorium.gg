import { createFileRoute } from '@tanstack/react-router'
import { referenceSitemap } from '../server/referenceDiscovery'

export const Route = createFileRoute('/sitemap.xml')({
  server: { handlers: { GET: ({ request }) => referenceSitemap(request) } },
})
