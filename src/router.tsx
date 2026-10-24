import { CancelledError } from '@tanstack/react-query'
import { createRouter, type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { Button } from '@/components/ui/button'
import { FullPageState } from './client/components/PageState'
import { createQueryClient } from './client/queryClient'
import { isModuleLoadFailure } from './client/networkErrors'
import { checkedStaleBuildRelease, staleBuildRelease } from './client/releaseUpdate'
import { writesPending } from './client/pendingWrites'
import {
  completedRouteRecovery,
  mayReloadCancelledLoad,
  reloadModuleRoute,
  reloadStaleBuild,
  reportRouteError,
  routeErrorExplanation,
  routeRecoveryPending,
} from './client/routeErrors'
import { siteOrigin } from './server/requestOrigin'
import { routeTree } from './routeTree.gen'

/**
 * A loader that joined a read whose last viewer unmounted mid-flight sees it cancelled, not failed, so the route loads
 * again instead of showing an error. Signing in in the mobile app does this: the refetch it starts loses its screen.
 * A page built before the deployed release can fail on the newer server's responses, which only its code can fix.
 */
function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const { queryClient } = router.options.context
  const [reload] = useState(() => error instanceof CancelledError && mayReloadCancelledLoad())
  useEffect(() => {
    if (reload) {
      void router.invalidate()
      return
    }
    let mounted = true
    void checkedStaleBuildRelease(queryClient).then((release) => {
      if (mounted && release) reloadStaleBuild(release, 'route_error', { saving: writesPending(queryClient) })
    })
    return () => {
      mounted = false
    }
  }, [reload, router, queryClient])
  if (reload) return null
  return (
    <FullPageState
      title="Something went wrong"
      explanation={routeErrorExplanation(error)}
      action={
        isModuleLoadFailure(error) ? (
          <Button data-route-error onClick={reloadModuleRoute}>
            Reload
          </Button>
        ) : (
          <Button
            data-route-error
            onClick={() =>
              void checkedStaleBuildRelease(queryClient).then((release) => {
                if (release) reloadStaleBuild(release, 'try_again')
                else void router.invalidate()
              })
            }
          >
            Try again
          </Button>
        )
      }
    />
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
