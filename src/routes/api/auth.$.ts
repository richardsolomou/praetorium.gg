import { createFileRoute } from '@tanstack/react-router'
import { app } from '../../server/app'
import { previewOAuthPostRequest, previewOidcRequest } from '../../server/previewOidc'

/** better-auth owns everything under here. */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => app().auth.handler(previewOidcRequest(request, process.env.SPACETIME_ISSUER, process.env.APP_URL)),
      POST: async ({ request }) =>
        app().auth.handler(await previewOAuthPostRequest(request, process.env.SPACETIME_ISSUER, process.env.APP_URL)),
    },
  },
})
