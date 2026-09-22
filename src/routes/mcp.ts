import { createFileRoute } from '@tanstack/react-router'
import { handleReferenceMcp, referenceMcpOptions } from '../server/referenceMcp'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handleReferenceMcp(request),
      POST: ({ request }) => handleReferenceMcp(request),
      DELETE: ({ request }) => handleReferenceMcp(request),
      OPTIONS: () => referenceMcpOptions(),
    },
  },
})
