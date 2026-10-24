import { CancelledError } from '@tanstack/react-query'
import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { isModuleLoadFailure } from '../networkErrors'
import { mayReloadCancelledLoad, reloadModuleRoute, routeErrorExplanation } from '../routeErrors'
import { FullPageState } from './PageState'

/**
 * A loader that joined a read whose last viewer unmounted mid-flight sees it cancelled, not failed, so the route loads
 * again instead of showing an error. Signing in in the mobile app does this: the refetch it starts loses its screen.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const [reload] = useState(() => error instanceof CancelledError && mayReloadCancelledLoad())
  useEffect(() => {
    if (reload) void router.invalidate()
  }, [reload, router])
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
          <Button data-route-error onClick={() => void router.invalidate()}>
            Try again
          </Button>
        )
      }
    />
  )
}
