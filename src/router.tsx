import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { RouteError } from './client/components/RouteError'
import { createQueryClient } from './client/queryClient'
import { writesPending } from './client/pendingWrites'
import { staleBuildRelease } from './client/releaseUpdate'
import { completedRouteRecovery, reloadStaleBuild, reportRouteError, routeRecoveryPending } from './client/routeErrors'
import { siteOrigin } from './server/requestOrigin'
import { routeTree } from './routeTree.gen'

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
  if (typeof window !== 'undefined') {
    // A route change discards the screen's unsaved state anyway, so a full load costs nothing a client navigation keeps.
    router.subscribe('onBeforeNavigate', ({ pathChanged, toLocation }) => {
      const release = pathChanged && staleBuildRelease(queryClient)
      if (release)
        reloadStaleBuild(release, 'navigation', {
          href: new URL(toLocation.href, window.location.origin).href,
          saving: writesPending(queryClient),
        })
    })
    router.subscribe('onRendered', () => {
      if (!routeRecoveryPending(window.location.href)) return
      const location = router.state.location.href
      const matches = router.state.matches
      const components = matches.map((match) => router.routesById[match.routeId]?.options.component)
      // SSR can commit before its lazy import settles; an unsuccessful import retains its preload function.
      void Promise.all(components.map((component) => Promise.resolve(component?.preload?.()))).then(
        () => {
          requestAnimationFrame(() => {
            if (
              router.state.location.href !== location ||
              document.querySelector('[data-route-error]') ||
              matches.some((match) => match.status !== 'success') ||
              components.some((component) => component?.preload)
            )
              return
            const recovered = completedRouteRecovery(window.location.href)
            if (recovered) router.history.replace(recovered)
          })
        },
        () => {},
      )
    })
  }
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
