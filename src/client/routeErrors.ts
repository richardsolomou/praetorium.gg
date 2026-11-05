import { CancelledError } from '@tanstack/react-query'
import { posthog } from 'posthog-js'
import { version } from '../../package.json'
import { captureWhenLoaded } from '../posthog'
import { isFetchNetworkFailure, isModuleLoadFailure } from './networkErrors'
import { OfflineRefusal } from './offline/offlineRefusal'
import { newerRelease } from './releaseUpdate'
import { readSessionValue, writeSessionValue } from './storedValue'

/** React passes errors caught by a route's error page only to console.error, so report them here. */
export function reportRouteError(error: unknown) {
  const attempt = typeof window === 'undefined' ? 0 : moduleRecoveryAttempt(window.location.href)
  if (attempt && isModuleLoadFailure(error))
    posthog.capture('route_recovery_failed', { failure_kind: 'module_load', recovery_attempt: attempt })
  if (!isFetchNetworkFailure(error) && !(error instanceof CancelledError) && !(error instanceof OfflineRefusal))
    posthog.captureException(error, {
      operation: 'route',
      ...(isModuleLoadFailure(error) ? { failure_kind: 'module_load', recovery_attempt: attempt } : {}),
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

/**
 * Scripts are cached as immutable, so Safari reuses its stored copy on every reload and a bad copy fails the same import
 * each time. Fetching each script the page lists with `cache: 'reload'` replaces the stored copy before the reload.
 * Returns how many of them could not be fetched.
 */
async function refreshPageScripts(urls: string[]) {
  const signal = AbortSignal.timeout(10_000)
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await fetch(url, { cache: 'reload', signal })
      if (!response.ok) throw new Error(String(response.status))
      await response.blob()
    }),
  )
  return results.filter((result) => result.status === 'rejected').length
}

export async function reloadModuleRoute() {
  const url = moduleRecoveryUrl(window.location.href)
  const scripts = [
    ...new Set([
      ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]'), (link) => link.href),
      ...Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'), (script) => script.src),
    ]),
  ]
  // Safari before 16 has no AbortSignal.timeout; the refresh must never keep the page from reloading.
  const failures = await refreshPageScripts(scripts).catch(() => scripts.length)
  posthog.capture('route_recovery_started', {
    failure_kind: 'module_load',
    recovery_attempt: moduleRecoveryAttempt(url),
    scripts_refreshed: scripts.length,
    script_refresh_failures: failures,
  })
  window.location.replace(url)
}

const STALE_BUILD_PARAM = '__build_retry'
/**
 * The tab's last stale-build key. A redirect, a tap before the page hydrates, or a navigation before the route settles
 * drops the key from the address, yet the reload still reached the new release.
 */
const STALE_BUILD_SESSION_KEY = 'praetorium.stale-build-recovery'

function parseStaleBuildMarker(value: string | null | undefined) {
  const match = value?.match(/^\d+\.([1-3])\.(\d+\.\d+\.\d+)$/)
  return match ? { attempt: Number(match[1]), release: match[2]! } : null
}

const staleBuildMarker = (href: string) => parseStaleBuildMarker(new URL(href).searchParams.get(STALE_BUILD_PARAM))

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
 * A navigation passes its history `entry`, which a reload keeps, so the page reopens with the state and back stack the
 * client navigation would have given it.
 */
export function reloadStaleBuild(
  release: string,
  trigger: 'navigation' | 'route_error' | 'try_again',
  {
    href = window.location.href,
    saving = false,
    entry,
  }: { href?: string; saving?: boolean; entry?: { state: unknown; push: boolean } } = {},
) {
  if (trigger !== 'try_again' && (saving || !navigator.onLine || staleBuildAttempt(href, release) >= 3)) {
    if (trigger === 'route_error' && staleBuildAttempt(href, release) >= 3)
      posthog.capture('route_recovery_failed', { failure_kind: 'stale_build', recovery_attempt: 3 })
    return false
  }
  const url = staleBuildRecoveryUrl(href, release)
  writeSessionValue(STALE_BUILD_SESSION_KEY, new URL(url).searchParams.get(STALE_BUILD_PARAM))
  posthog.capture('route_recovery_started', { failure_kind: 'stale_build', recovery_attempt: staleBuildAttempt(url, release), trigger })
  if (window.ReactNativeWebView && window.PraetoriumOfflineStart !== undefined) {
    const { pathname, search, hash } = new URL(url)
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'offline-retry', path: pathname + search + hash }))
  } else if (entry) {
    window.history[entry.push ? 'pushState' : 'replaceState'](entry.state, '', url)
    window.location.reload()
  } else window.location.replace(url)
  return true
}

export function withoutRecoveryKeys(href: string) {
  const url = new URL(href, 'https://praetorium.invalid')
  if (!url.searchParams.has(RECOVERY_PARAM) && !url.searchParams.has(STALE_BUILD_PARAM)) return href
  url.searchParams.delete(RECOVERY_PARAM)
  url.searchParams.delete(STALE_BUILD_PARAM)
  return url.pathname + url.search + url.hash
}

const storedStaleBuildMarker = () => parseStaleBuildMarker(readSessionValue(STALE_BUILD_SESSION_KEY))

export const routeRecoveryPending = (href: string) =>
  moduleRecoveryAttempt(href) > 0 || staleBuildMarker(href) !== null || storedStaleBuildMarker() !== null

/** Removes the recovery keys a rendered route resolves; a reload that still runs an older build keeps its key, so the cap holds. */
export function completedRouteRecovery(href: string, current = version) {
  const url = new URL(href)
  const moduleAttempt = moduleRecoveryAttempt(href)
  if (moduleAttempt) {
    url.searchParams.delete(RECOVERY_PARAM)
    captureWhenLoaded('route_recovery_completed', { failure_kind: 'module_load', recovery_attempt: moduleAttempt })
  }
  const inAddress = staleBuildMarker(href)
  const stale = inAddress ?? storedStaleBuildMarker()
  const staleResolved = stale !== null && !newerRelease(current, stale.release)
  if (staleResolved) {
    url.searchParams.delete(STALE_BUILD_PARAM)
    writeSessionValue(STALE_BUILD_SESSION_KEY, null)
    captureWhenLoaded('route_recovery_completed', { failure_kind: 'stale_build', recovery_attempt: stale.attempt })
  }
  return moduleAttempt || (staleResolved && inAddress) ? url.pathname + url.search + url.hash : null
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
