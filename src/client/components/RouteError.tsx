import { CancelledError } from '@tanstack/react-query'
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isModuleLoadFailure } from '../networkErrors'
import { writesPending } from '../pendingWrites'
import { checkedStaleBuildRelease } from '../releaseUpdate'
import { mayReloadCancelledLoad, reloadModuleRoute, reloadStaleBuild, routeErrorExplanation } from '../routeErrors'
import { FullPageState } from './PageState'

/**
 * A loader that joined a read whose last viewer unmounted mid-flight sees it cancelled, not failed, so the route loads
 * again instead of showing an error. Signing in in the mobile app does this: the refetch it starts loses its screen.
 * A page built before the deployed release can fail on the newer server's responses, which only its code can fix.
 */
export function RouteError({ error }: ErrorComponentProps) {
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
