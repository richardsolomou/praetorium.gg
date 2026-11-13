import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { RouteError } from './client/components/RouteError'
import { createQueryClient } from './client/queryClient'
import { writesPending } from './client/pendingWrites'
import { staleBuildRelease } from './client/releaseUpdate'
import { completedRouteRecovery, reloadStaleBuild, reportRouteError, routeRecoveryPending } from './client/routeErrors'
import { openedTextPage } from './client/sourceText'
import { siteOrigin } from './server/requestOrigin'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = createQueryClient()
  const router = createRouter({
    routeTree,
    // Read once per request on the server, so every page's metadata can print absolute links.
    context: { queryClient, origin: siteOrigin() },
    defaultPreload: 'intent',
    // A transition holds input until it ends, so it runs only between pages: never for a filter rewriting the address.
    // Nor going back, which a back swipe has already animated; fading after it flashes the page being left.
    defaultViewTransition: {
      types: ({ pathChanged, fromLocation, toLocation }) =>
        pathChanged &&
        !(fromLocation && toLocation.state.__TSR_index < fromLocation.state.__TSR_index) &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
          ? ['page']
          : false,
    },
    defaultErrorComponent: RouteError,
    defaultOnCatch: reportRouteError,
  })
  if (typeof window !== 'undefined') {
    // A blocker sees the destination's history state before the router commits it, which a reload in place then keeps.
    // Once reloading, a second tap must not push another entry onto the back stack.
    let reloading = false
    router.history.block({
      enableBeforeUnload: false,
      blockerFn: ({ currentLocation, nextLocation, action }) => {
        const release = !reloading && nextLocation.pathname !== currentLocation.pathname && staleBuildRelease(queryClient)
        reloading ||= Boolean(
          release &&
          reloadStaleBuild(release, 'navigation', {
            href: new URL(nextLocation.href, window.location.origin).href,
            saving: writesPending(queryClient),
            entry: { state: nextLocation.state, push: action === 'PUSH' },
          }),
        )
        // Back and forward have already reached their entry; blocking them would make the router step the browser back.
        return reloading && (action === 'PUSH' || action === 'REPLACE')
      },
    })
    // A filter rewriting the address stays on the same page, so only a new path asks failed rules text again.
    router.subscribe('onBeforeNavigate', ({ pathChanged }) => {
      if (pathChanged) openedTextPage()
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
            if (recovered) router.history.replace(recovered, router.history.location.state)
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
