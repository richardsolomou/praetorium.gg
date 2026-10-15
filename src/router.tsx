import { CancelledError } from '@tanstack/react-query'
import { createRouter, type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createQueryClient, errorMessage } from './client/queryClient'
import { mayReloadCancelledLoad, reportRouteError } from './client/routeErrors'
import { siteOrigin } from './server/requestOrigin'
import { routeTree } from './routeTree.gen'

/**
 * A loader that joined a read whose last viewer unmounted mid-flight sees it cancelled, not failed, so the route loads
 * again instead of showing an error. Signing in in the mobile app does this: the refetch it starts loses its screen.
 */
function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const [reload] = useState(() => error instanceof CancelledError && mayReloadCancelledLoad())
  useEffect(() => {
    if (reload) void router.invalidate()
  }, [reload, router])
  if (reload) return null
  return (
    <main className="mx-auto mt-[15vh] max-w-md px-6 text-center">
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="mt-2 text-sm text-dim">{errorMessage(error)}</p>
    </main>
  )
}

export function getRouter() {
  const queryClient = createQueryClient()
  const router = createRouter({
    routeTree,
    // Read once per request on the server, so every page's metadata can print absolute links.
    context: { queryClient, origin: siteOrigin() },
    defaultPreload: 'intent',
    defaultErrorComponent: RouteError,
    defaultOnCatch: reportRouteError,
  })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
