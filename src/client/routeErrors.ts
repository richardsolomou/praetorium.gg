import { CancelledError } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { isFetchNetworkFailure } from './networkErrors'

/** React passes errors caught by a route's error page only to console.error, so report them here. */
export function reportRouteError(error: unknown) {
  if (!isFetchNetworkFailure(error) && !(error instanceof CancelledError)) posthog.captureException(error, { operation: 'route' })
}

const recentReloads: number[] = []

/** Whether a cancelled load may reload again, so a load cancelled every time shows its error instead of looping. */
export function mayReloadCancelledLoad(now = Date.now()) {
  while (recentReloads.length && now - recentReloads[0]! > 10_000) recentReloads.shift()
  if (recentReloads.length >= 3) return false
  recentReloads.push(now)
  return true
}
