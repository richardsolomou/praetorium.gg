import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createQueryClient, errorMessage } from './client/queryClient'
import { siteOrigin } from './server/requestOrigin'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = createQueryClient()
  const router = createRouter({
    routeTree,
    // Read once per request on the server, so every page's metadata can print absolute links.
    context: { queryClient, origin: siteOrigin() },
    defaultPreload: 'intent',
    defaultErrorComponent: ({ error }) => (
      <main className="mx-auto mt-[15vh] max-w-md px-6 text-center">
        <h1 className="text-2xl">Something went wrong</h1>
        <p className="mt-2 text-sm text-dim">{errorMessage(error)}</p>
      </main>
    ),
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
