import { CancelledError } from '@tanstack/react-query'
import type { PostHog } from 'posthog-js'
import { beforeEach, expect, it, vi } from 'vitest'

const captureException = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
const client = vi.hoisted(() => ({ captureException, capture, __loaded: true }))
vi.mock('posthog-js', () => ({ posthog: client }))

import { POSTHOG_BROWSER_OPTIONS } from '../posthog'
import {
  completedModuleRecovery,
  mayReloadCancelledLoad,
  moduleRecoveryUrl,
  notFoundPage,
  reportRouteError,
  routeErrorExplanation,
} from './routeErrors'

beforeEach(() => {
  client.__loaded = true
  captureException.mockClear()
  capture.mockClear()
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
  expect(completedModuleRecovery('https://praetorium.gg/factions?q=necrons&__route_retry=1234.2#armies')).toBe('/factions?q=necrons#armies')
})

it('does not report successful recovery for an ordinary navigation', () => {
  expect(completedModuleRecovery('https://praetorium.gg/factions')).toBeNull()
})

it('reports recovery completion with bounded metadata', () => {
  completedModuleRecovery('https://praetorium.gg/factions?private=kept&__route_retry=1234.3#armies')
  expect(capture.mock.calls).toEqual([['route_recovery_completed', { failure_kind: 'module_load', recovery_attempt: 3 }]])
})

it('keeps invalid recovery keys out of completion telemetry', () => {
  completedModuleRecovery('https://praetorium.gg/factions?__route_retry=arbitrary-text')
  expect(capture).not.toHaveBeenCalled()
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
