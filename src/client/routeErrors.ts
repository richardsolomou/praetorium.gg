import { CancelledError } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { isFetchNetworkFailure, isModuleLoadFailure } from './networkErrors'

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

/** What a route error page tells the reader: its message when written for people, never a raw payload or markup. */
export function routeErrorExplanation(error: unknown) {
  if (isModuleLoadFailure(error)) return 'Praetorium has been updated since this page opened. Reload to continue.'
  const message = error instanceof Error ? error.message.trim() : ''
  if (message && message.length <= 200 && !/^[[{<]/.test(message)) return message
  return 'This page could not load. Try again.'
}
