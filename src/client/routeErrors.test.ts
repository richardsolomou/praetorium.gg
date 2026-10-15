import { CancelledError } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'

const captureException = vi.hoisted(() => vi.fn())
vi.mock('posthog-js', () => ({ posthog: { captureException } }))

import { mayReloadCancelledLoad, reportRouteError, routeErrorExplanation } from './routeErrors'

beforeEach(() => captureException.mockClear())

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
  expect(captureException).toHaveBeenCalledWith(error, { operation: 'route' })
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

it("asks the reader to reload after a deploy replaced the page's code", () => {
  expect(routeErrorExplanation(new TypeError('Importing a module script failed.'))).toBe(
    'Praetorium has been updated since this page opened. Reload to continue.',
  )
})
