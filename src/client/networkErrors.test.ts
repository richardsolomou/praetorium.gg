import { expect, it } from 'vitest'
import { isFetchNetworkFailure } from './networkErrors'

it.each([
  new TypeError('Failed to fetch'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new TypeError('Load failed'),
  new TypeError('fetch failed'),
])('treats %s as a network failure', (error) => {
  expect(isFetchNetworkFailure(error)).toBe(true)
})

it.each([new Error('Failed to fetch'), new TypeError('x is not a function'), 'Failed to fetch', null])(
  'reports %s as an application failure',
  (error) => {
    expect(isFetchNetworkFailure(error)).toBe(false)
  },
)
