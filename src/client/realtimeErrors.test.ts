import { expect, it } from 'vitest'
import { isExpectedRealtimeDisconnect, RealtimeHttpError } from './realtimeErrors'

it.each([
  new Event('error'),
  { code: 11, message: 'connection closed' },
  Object.assign(new Error(''), { name: 'UnauthorizedError' }),
  new Error('Failed to verify token: '),
  new Error('Failed to verify token: Unauthorized'),
  new TypeError('Failed to fetch'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new TypeError('Load failed'),
  new TypeError('fetch failed'),
  ...[401, 408, 429, 500, 502, 503, 504].map((status) => new RealtimeHttpError('Spacetime token', status)),
])('treats %s as a recoverable realtime failure', (error) => {
  expect(isExpectedRealtimeDisconnect(error)).toBe(true)
})

it.each([
  new Error('Invalid subscription'),
  new TypeError('x is not a function'),
  { code: 1, message: 'internal error' },
  'connection closed',
  null,
  new Event('message'),
  ...[400, 403, 404].map((status) => new RealtimeHttpError('Spacetime token', status)),
])('reports %s as an unexpected realtime failure', (error) => {
  expect(isExpectedRealtimeDisconnect(error)).toBe(false)
})
