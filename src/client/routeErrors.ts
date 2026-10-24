import { CancelledError } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { captureWhenLoaded } from '../posthog'
import { isFetchNetworkFailure, isModuleLoadFailure } from './networkErrors'

/** React passes errors caught by a route's error page only to console.error, so report them here. */
export function reportRouteError(error: unknown) {
  if (!isFetchNetworkFailure(error) && !(error instanceof CancelledError))
    posthog.captureException(error, {
      operation: 'route',
      ...(isModuleLoadFailure(error)
        ? { failure_kind: 'module_load', recovery_attempt: typeof window === 'undefined' ? 0 : moduleRecoveryAttempt(window.location.href) }
        : {}),
    })
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
  if (isModuleLoadFailure(error)) return 'Part of this page could not load. Check your connection, then reload to try again.'
  const message = error instanceof Error ? error.message.trim() : ''
  if (message && message.length <= 200 && !/^[[{<]/.test(message)) return message
  return 'This page could not load. Try again.'
}

const RECOVERY_PARAM = '__route_retry'

export function moduleRecoveryAttempt(href: string) {
  const value = new URL(href).searchParams.get(RECOVERY_PARAM)
  return value && /^\d+\.[1-3]$/.test(value) ? Number(value.split('.')[1]) : 0
}

/** A new document cache key avoids replaying the same cached page after a failed import. */
export function moduleRecoveryUrl(href: string, now = Date.now()) {
  const url = new URL(href)
  url.searchParams.set(RECOVERY_PARAM, `${now}.${Math.min(moduleRecoveryAttempt(href) + 1, 3)}`)
  return url.href
}

export function reloadModuleRoute() {
  const url = moduleRecoveryUrl(window.location.href)
  posthog.capture('route_recovery_started', { failure_kind: 'module_load', recovery_attempt: moduleRecoveryAttempt(url) })
  window.location.replace(url)
}

export function completedModuleRecovery(href: string) {
  const attempt = moduleRecoveryAttempt(href)
  if (!attempt) return null
  const url = new URL(href)
  url.searchParams.delete(RECOVERY_PARAM)
  posthog.capture('route_recovery_completed', { failure_kind: 'module_load', recovery_attempt: attempt })
  return url.pathname + url.search + url.hash
}

/**
 * Records a not-found page. `path` is a grouping key that keeps only words some route spells out; the SDK's own URL
 * properties still carry the address, as on any pageview. Crawlers that run no JavaScript appear only in the server's `$http_log`.
 */
export function notFoundPage(pathname: string, routePaths: readonly string[]) {
  const words = new Set(routePaths.flatMap((path) => path.split('/').filter((segment) => segment && !/[${]/.test(segment))))
  const segments = pathname.split('/').filter(Boolean)
  captureWhenLoaded('page_not_found', { path: `/${segments.map((segment) => (words.has(segment) ? segment : ':id')).join('/')}` })
}
