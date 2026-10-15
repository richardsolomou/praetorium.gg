import { CancelledError } from '@tanstack/react-query'
import { beforeEach, expect, it, vi } from 'vitest'

const captureException = vi.hoisted(() => vi.fn())
vi.mock('posthog-js', () => ({ posthog: { captureException } }))

import { mayReloadCancelledLoad, reportRouteError } from './routeErrors'

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
