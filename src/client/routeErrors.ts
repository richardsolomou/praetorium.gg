import { posthog } from 'posthog-js'
import { isFetchNetworkFailure } from './networkErrors'

/** React passes errors caught by a route's error page only to console.error, so report them here. */
export function reportRouteError(error: unknown) {
  if (!isFetchNetworkFailure(error)) posthog.captureException(error, { operation: 'route' })
}
