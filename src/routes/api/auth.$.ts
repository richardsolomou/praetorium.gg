import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { authPostRequest, previewOidcRequest } from '../../server/previewOidc'

/** better-auth owns everything under here. */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => app().auth.handler(previewOidcRequest(request, process.env.SPACETIME_ISSUER, process.env.APP_URL)),
      POST: async ({ request }) => {
        const bounded = await authPostRequest(request, process.env.SPACETIME_ISSUER, process.env.APP_URL)
        return bounded ? app().auth.handler(bounded) : new Response('Payload too large', { status: 413 })
      },
    },
  },
})
