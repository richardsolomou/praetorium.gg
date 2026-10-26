import { CancelledError } from '@tanstack/react-query'
import type { PostHog } from 'posthog-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const captureException = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => ({ captureException, capture, __loaded: true }))
vi.mock('posthog-js', () => ({ posthog: client }))

import { POSTHOG_BROWSER_OPTIONS } from '../posthog'
import { OfflineRefusal } from './offline/offlineRefusal'
import {
  completedRouteRecovery,
  mayReloadCancelledLoad,
  moduleRecoveryUrl,
  reloadStaleBuild,
  notFoundPage,
  reportRouteError,
  routeErrorExplanation,
  staleBuildRecoveryUrl,
} from './routeErrors'

const replace = vi.fn()

beforeEach(() => {
  client.__loaded = true
  captureException.mockClear()
  capture.mockClear()
  replace.mockClear()
  vi.stubGlobal('window', { location: { href: 'https://praetorium.gg/rosters/1', replace } })
  vi.stubGlobal('navigator', { onLine: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reports an error caught by a route error page', () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'map')")
  reportRouteError(error)
  expect(captureException.mock.calls).toEqual([[error, { operation: 'route' }]])
})

it('leaves a dropped connection out of error tracking', () => {
  reportRouteError(new TypeError('Failed to fetch'))
  expect(captureException).not.toHaveBeenCalled()
})

it('reports a chunk that failed to load after a deploy', () => {
  const error = new TypeError('Failed to fetch dynamically imported module: https://praetorium.gg/assets/a.js')
  reportRouteError(error)
  expect(captureException).toHaveBeenCalledWith(error, { operation: 'route', failure_kind: 'module_load', recovery_attempt: 0 })
})

it('leaves a cancelled read out of error tracking, since the route loads again', () => {
  reportRouteError(new CancelledError())
  expect(captureException).not.toHaveBeenCalled()
})

it('leaves a screen this device has not saved out of error tracking, since the player must reconnect', () => {
  reportRouteError(new OfflineRefusal('This screen has not been saved on this device. Reconnect to load it.'))
  expect(captureException).not.toHaveBeenCalled()
})

it('stops reloading a load cancelled three times within ten seconds', () => {
  const start = 1_000_000
  expect([0, 1, 2, 3].map((offset) => mayReloadCancelledLoad(start + offset * 1_000))).toEqual([true, true, true, false])
})

it('reloads a cancelled load again once ten seconds have passed', () => {
  const start = 2_000_000
  for (let offset = 0; offset < 3; offset++) mayReloadCancelledLoad(start + offset)
  expect(mayReloadCancelledLoad(start + 10_003)).toBe(true)
})

it('explains a route error with its message when it is written for people', () => {
  expect(routeErrorExplanation(new Error('This roster is private.'))).toBe('This roster is private.')
})

it.each([
  new Error('[{"code":"unrecognized_keys","keys":["pointsBudget"],"path":[],"message":"Unrecognized key: \\"pointsBudget\\""}]'),
  new Error('<!DOCTYPE html><html><body>Bad gateway</body></html>'),
  new Error('x'.repeat(201)),
  'not an error',
])('hides a raw route error behind a retry message: %s', (error) => {
  expect(routeErrorExplanation(error)).toBe('This page could not load. Try again.')
})

it('explains a failed route import without assuming a deploy caused it', () => {
  expect(routeErrorExplanation(new TypeError('Importing a module script failed.'))).toBe(
    'Part of this page could not load. Check your connection, then reload to try again.',
  )
})

it('reloads the same route with a fresh cache key and keeps its search and fragment', () => {
  expect(moduleRecoveryUrl('https://praetorium.gg/factions?q=necrons#armies', 1234)).toBe(
    'https://praetorium.gg/factions?q=necrons&__route_retry=1234.1#armies',
  )
})

it('replaces an earlier recovery key while bounding the reported attempt', () => {
  expect(moduleRecoveryUrl('https://praetorium.gg/factions?__route_retry=1234.3', 5678)).toBe(
    'https://praetorium.gg/factions?__route_retry=5678.3',
  )
})

it('removes only the recovery key after the destination resolves', () => {
  expect(completedRouteRecovery('https://praetorium.gg/factions?q=necrons&__route_retry=1234.2#armies')).toBe('/factions?q=necrons#armies')
})

it('does not report successful recovery for an ordinary navigation', () => {
  expect(completedRouteRecovery('https://praetorium.gg/factions')).toBeNull()
})

it('reports recovery completion with bounded metadata', () => {
  completedRouteRecovery('https://praetorium.gg/factions?private=kept&__route_retry=1234.3#armies')
  expect(capture.mock.calls).toEqual([['route_recovery_completed', { failure_kind: 'module_load', recovery_attempt: 3 }]])
})

it('keeps invalid recovery keys out of completion telemetry', () => {
  completedRouteRecovery('https://praetorium.gg/factions?__route_retry=arbitrary-text')
  expect(capture).not.toHaveBeenCalled()
})

it('reloads a stale build with a fresh cache key naming the release it reloads for', () => {
  expect(staleBuildRecoveryUrl('https://praetorium.gg/rosters/1?tab=units#wargear', '0.177.0', 1234)).toBe(
    'https://praetorium.gg/rosters/1?tab=units&__build_retry=1234.1.0.177.0#wargear',
  )
})

it('counts another reload for the same release', () => {
  expect(staleBuildRecoveryUrl('https://praetorium.gg/rosters/1?__build_retry=1234.2.0.177.0', '0.177.0', 5678)).toBe(
    'https://praetorium.gg/rosters/1?__build_retry=5678.3.0.177.0',
  )
})

it('starts counting again for a later release', () => {
  expect(staleBuildRecoveryUrl('https://praetorium.gg/rosters/1?__build_retry=1234.3.0.177.0', '0.178.0', 5678)).toBe(
    'https://praetorium.gg/rosters/1?__build_retry=5678.1.0.178.0',
  )
})

it('reloads a stale build automatically', () => {
  expect(reloadStaleBuild('0.177.0', 'route_error')).toBe(true)
})

it('reloads a stale build at the navigation destination', () => {
  reloadStaleBuild('0.177.0', 'navigation', { href: 'https://praetorium.gg/battles' })
  expect(new URL(replace.mock.calls[0]![0]).pathname).toBe('/battles')
})

it('reports a stale-build reload with bounded metadata', () => {
  reloadStaleBuild('0.177.0', 'navigation')
  expect(capture.mock.calls).toEqual([
    ['route_recovery_started', { failure_kind: 'stale_build', recovery_attempt: 1, trigger: 'navigation' }],
  ])
})

it('stops reloading automatically after three reloads for the same release', () => {
  const href = 'https://praetorium.gg/rosters/1?__build_retry=1234.3.0.177.0'
  expect(reloadStaleBuild('0.177.0', 'route_error', { href })).toBe(false)
})

it('still reloads when the reader asks after three automatic reloads', () => {
  const href = 'https://praetorium.gg/rosters/1?__build_retry=1234.3.0.177.0'
  expect(reloadStaleBuild('0.177.0', 'try_again', { href })).toBe(true)
})

it('does not reload automatically while a change is saving', () => {
  expect(reloadStaleBuild('0.177.0', 'navigation', { saving: true })).toBe(false)
})

it('does not reload automatically while offline, where the reload could not reach the new release', () => {
  vi.stubGlobal('navigator', { onLine: false })
  expect(reloadStaleBuild('0.177.0', 'navigation')).toBe(false)
})

it('reports stale-build recovery once the page runs the release it reloaded for', () => {
  completedRouteRecovery('https://praetorium.gg/rosters/1?__build_retry=1234.2.0.177.0', '0.177.0')
  expect(capture.mock.calls).toEqual([['route_recovery_completed', { failure_kind: 'stale_build', recovery_attempt: 2 }]])
})

it('removes the stale-build key once the page runs the release it reloaded for', () => {
  expect(completedRouteRecovery('https://praetorium.gg/rosters/1?tab=units&__build_retry=1234.2.0.177.0#wargear', '0.177.0')).toBe(
    '/rosters/1?tab=units#wargear',
  )
})

it('keeps the stale-build key while the page still runs an older build, so the reload cap holds', () => {
  expect(completedRouteRecovery('https://praetorium.gg/rosters/1?__build_retry=1234.2.0.177.0', '0.176.0')).toBeNull()
})

it('asks the native shell to open the hosted release instead of loading it inside the saved application', () => {
  const postMessage = vi.fn()
  vi.stubGlobal('window', {
    location: { href: 'https://praetorium.gg/rosters/1', replace },
    PraetoriumOfflineStart: '/rosters/1',
    ReactNativeWebView: { postMessage },
  })
  reloadStaleBuild('0.177.0', 'navigation', { href: 'https://praetorium.gg/battles?tab=live#top' })
  expect(JSON.parse(postMessage.mock.calls[0]![0])).toEqual({
    type: 'offline-retry',
    path: expect.stringMatching(/^\/battles\?tab=live&__build_retry=\d+\.1\.0\.177\.0#top$/),
  })
})

it('leaves the saved application in place when the native shell opens the hosted release', () => {
  vi.stubGlobal('window', {
    location: { href: 'https://praetorium.gg/rosters/1', replace },
    PraetoriumOfflineStart: '/rosters/1',
    ReactNativeWebView: { postMessage: vi.fn() },
  })
  reloadStaleBuild('0.177.0', 'try_again')
  expect(replace).not.toHaveBeenCalled()
})

it('reports a not-found page with its address reduced to route words', () => {
  notFoundPage('/factions/space-marines/datasheets/abc123', ['/factions/$catalogueId/datasheets/$datasheetId'])
  expect(capture).toHaveBeenCalledWith('page_not_found', { path: '/factions/:id/datasheets/:id' })
})

it('keeps unknown words out of a not-found address', () => {
  notFoundPage('/Jane.Doe@example.com/battles', ['/battles'])
  expect(capture).toHaveBeenCalledWith('page_not_found', { path: '/:id/battles' })
})

it('reports the home page address of a not-found page as itself', () => {
  notFoundPage('/', ['/'])
  expect(capture).toHaveBeenCalledWith('page_not_found', { path: '/' })
})

it('holds a not-found report made before the SDK loads, as on a page opened at a missing address', () => {
  client.__loaded = false
  notFoundPage('/missing', [])
  expect(capture).not.toHaveBeenCalled()
})

it('sends a held not-found report once the SDK loads', () => {
  client.__loaded = false
  notFoundPage('/missing', [])
  POSTHOG_BROWSER_OPTIONS.loaded(client as unknown as PostHog)
  expect(capture).toHaveBeenCalledWith('page_not_found', { path: '/:id' })
})
