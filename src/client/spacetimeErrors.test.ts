import { IdentityChangedError, UnknownCallResultError } from 'spacetimedb'
import { expect, it } from 'vitest'
import { RealtimeHttpError } from './realtimeErrors'
import { isExpectedRealtimeDisconnect } from './spacetimeErrors'

it.each([
  new Event('error'),
  new Error('WebSocket error', { cause: new Event('error') }),
  new Error('WebSocket closed (code 1006)'),
  new Error('WebSocket closed while suspended'),
  new Error('Session busy'),
  { code: 11, message: 'connection closed' },
  Object.assign(new Error(''), { name: 'UnauthorizedError' }),
  new DOMException('signal timed out', 'TimeoutError'),
  new Error('Failed to verify token: '),
  new Error('Failed to verify token: Unauthorized'),
  new TypeError('Failed to fetch'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  new TypeError('Load failed'),
  new TypeError('fetch failed'),
  new IdentityChangedError(),
  new UnknownCallResultError(),
  new DOMException("Failed to construct 'WebSocket': Failed to create a WebSocket: the provided URL is invalid.", 'SyntaxError'),
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
  new Error('WebSocket error', { cause: new Event('message') }),
  new DOMException("Failed to construct 'WebSocket': The URL 'wss://' is invalid.", 'SyntaxError'),
  ...[400, 403, 404].map((status) => new RealtimeHttpError('Spacetime token', status)),
])('reports %s as an unexpected realtime failure', (error) => {
  expect(isExpectedRealtimeDisconnect(error)).toBe(false)
})
