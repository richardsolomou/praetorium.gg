import { CancelledError } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { version } from '../../package.json'
import { captureWhenLoaded } from '../posthog'
import { isFetchNetworkFailure, isModuleLoadFailure } from './networkErrors'
import { OfflineRefusal } from './offline/offlineRefusal'
import { newerRelease } from './releaseUpdate'

/** React passes errors caught by a route's error page only to console.error, so report them here. */
export function reportRouteError(error: unknown) {
  if (!isFetchNetworkFailure(error) && !(error instanceof CancelledError) && !(error instanceof OfflineRefusal))
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

function moduleRecoveryAttempt(href: string) {
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

const STALE_BUILD_PARAM = '__build_retry'

function staleBuildMarker(href: string) {
  const match = new URL(href).searchParams.get(STALE_BUILD_PARAM)?.match(/^\d+\.([1-3])\.(\d+\.\d+\.\d+)$/)
  return match ? { attempt: Number(match[1]), release: match[2]! } : null
}

const staleBuildAttempt = (href: string, release: string) => {
  const marker = staleBuildMarker(href)
  return marker?.release === release ? marker.attempt : 0
}

export function staleBuildRecoveryUrl(href: string, release: string, now = Date.now()) {
  const url = new URL(href)
  url.searchParams.set(STALE_BUILD_PARAM, `${now}.${Math.min(staleBuildAttempt(href, release) + 1, 3)}.${release}`)
  return url.href
}

/**
 * Loads `href` from the deployed `release` instead of this page's older build, whose code can misread newer responses.
 * Automatic reloads wait out saves, need a connection to reach the release, and stop after three in a row of one page
 * for one release. The native saved application asks its shell to open the hosted page, which only the shell can set up.
 */
export function reloadStaleBuild(
  release: string,
  trigger: 'navigation' | 'route_error' | 'try_again',
  { href = window.location.href, saving = false } = {},
) {
  if (trigger !== 'try_again' && (saving || !navigator.onLine || staleBuildAttempt(href, release) >= 3)) return false
  const url = staleBuildRecoveryUrl(href, release)
  posthog.capture('route_recovery_started', { failure_kind: 'stale_build', recovery_attempt: staleBuildAttempt(url, release), trigger })
  if (window.ReactNativeWebView && window.PraetoriumOfflineStart !== undefined) {
    const { pathname, search, hash } = new URL(url)
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'offline-retry', path: pathname + search + hash }))
  } else window.location.replace(url)
  return true
}

export const routeRecoveryPending = (href: string) => moduleRecoveryAttempt(href) > 0 || staleBuildMarker(href) !== null

/**
 * Removes the recovery keys a rendered route resolves; a reload that still runs an older build keeps its key, so the cap holds.
 * The reloaded page can render before the SDK loads, so completion waits for it instead of being dropped.
 */
export function completedRouteRecovery(href: string, current = version) {
  const url = new URL(href)
  const moduleAttempt = moduleRecoveryAttempt(href)
  if (moduleAttempt) {
    url.searchParams.delete(RECOVERY_PARAM)
    captureWhenLoaded('route_recovery_completed', { failure_kind: 'module_load', recovery_attempt: moduleAttempt })
  }
  const stale = staleBuildMarker(href)
  const staleResolved = stale !== null && !newerRelease(current, stale.release)
  if (staleResolved) {
    url.searchParams.delete(STALE_BUILD_PARAM)
    captureWhenLoaded('route_recovery_completed', { failure_kind: 'stale_build', recovery_attempt: stale.attempt })
  }
  return moduleAttempt || staleResolved ? url.pathname + url.search + url.hash : null
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
