import { expect, it } from 'vitest'
import { spacetimeOrigin, spacetimeRoute } from './nodeServer'

const database = 'praetorium-staging'

it('allows only identity, token exchange, and the selected database subscription', () => {
  const route = (url: string, method: string, upgrade?: string) =>
    spacetimeRoute({ url, method, headers: upgrade ? { upgrade } : {} }, database)
  expect([
    route('/spacetime/v1/identity', 'POST'),
    route('/spacetime/v1/identity/websocket-token', 'POST'),
    route(`/spacetime/v1/database/${database}/subscribe?token=short`, 'GET', 'websocket'),
    route(`/spacetime/v1/database/${database}/sql`, 'POST'),
    route('/spacetime/v1/database/other/subscribe', 'GET', 'websocket'),
    route(`/spacetime/v1/database/${database}/subscribe`, 'GET'),
    route('//other.example/spacetime/v1/identity', 'POST'),
  ]).toEqual(['identity', 'exchange', 'subscribe', null, null, null, null])
})

it('accepts HTTP only for loopback or one configured internal service', () => {
  const environment = { SPACETIME_INTERNAL_HOST: 'spacetimedb-staging' }
  expect(spacetimeOrigin({ ...environment, SPACETIME_URL: 'http://spacetimedb-staging:3000/' }).host).toBe('spacetimedb-staging:3000')
  expect(() => spacetimeOrigin({ ...environment, SPACETIME_URL: 'http://other-service:3000/' })).toThrow('Invalid SpacetimeDB proxy origin')
  expect(() => spacetimeOrigin({ ...environment, SPACETIME_URL: 'http://spacetimedb-staging:3000/sql' })).toThrow(
    'Invalid SpacetimeDB proxy origin',
  )
})
