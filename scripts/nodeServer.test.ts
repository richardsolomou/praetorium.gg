import { expect, it } from 'vitest'
import { cacheAssetResponse, forwardVisitor, spacetimeOrigin, spacetimeRoute } from './nodeServer'

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

it('stops a CDN or browser from keeping a missing build asset', () => {
  const proxied = (url: string, statusCode: number) => {
    const response = { statusCode, headers: { 'cache-control': statusCode === 200 ? 'public, max-age=31536000, immutable' : undefined } }
    cacheAssetResponse({ url, method: 'GET' }, response)
    return response.headers['cache-control']
  }
  expect([proxied('/assets/index-BRgM8bBN.js', 404), proxied('/assets/index-BRgM8bBN.js', 200), proxied('/rosters/missing', 404)]).toEqual([
    'no-store',
    'public, max-age=31536000, immutable',
    undefined,
  ])
})

it.each([
  ['/logo.svg', 'public, max-age=86400'],
  ['/favicon.svg', 'public, max-age=86400'],
  ['/logo.svg?download=1', 'public, max-age=86400'],
  ['/api/collection-photos/photo', undefined],
  ['/api/previews/rosters/list', undefined],
])('sets a static image policy for %s', (url, expected) => {
  const response = { statusCode: 200, headers: {} as Record<string, string> }
  cacheAssetResponse({ url, method: 'GET' }, response)
  expect(response.headers['cache-control']).toBe(expected)
})

it.each([200, 304])('keeps the static image policy on HEAD responses with status %s', (statusCode) => {
  const response = { statusCode, headers: {} as Record<string, string> }
  cacheAssetResponse({ url: '/logo.svg', method: 'HEAD' }, response)
  expect(response.headers['cache-control']).toBe('public, max-age=86400')
})

it.each([404, 500])('does not cache a static image response with status %s', (statusCode) => {
  const response = { statusCode, headers: { 'cache-control': 'public, max-age=31536000, immutable' } }
  cacheAssetResponse({ url: '/logo.svg', method: 'GET' }, response)
  expect(response.headers['cache-control']).toBe('no-store')
})

it.each([{ 'cache-control': 'private, no-store' }, { 'set-cookie': ['session=private'] }])(
  'preserves an upstream privacy boundary',
  (headers) => {
    const response = { statusCode: 200, headers: { ...headers } }
    cacheAssetResponse({ url: '/logo.svg', method: 'GET' }, response)
    expect(response.headers).toEqual(headers)
  },
)

const forwarded = (headers: Record<string, string>) => {
  const request = { headers: { ...headers } }
  forwardVisitor(request)
  return request.headers['x-forwarded-for']
}

it("forwards Cloudflare's visitor address ahead of the edge's own", () => {
  expect(forwarded({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '198.51.100.20' })).toBe('203.0.113.7')
})

it('keeps the forwarded chain when Cloudflare names no visitor', () => {
  expect(forwarded({ 'x-forwarded-for': '198.51.100.4' })).toBe('198.51.100.4')
})

it('ignores a visitor header that is not an address', () => {
  expect(forwarded({ 'cf-connecting-ip': 'not-an-address', 'x-forwarded-for': '198.51.100.4' })).toBe('198.51.100.4')
})

it('accepts an IPv6 visitor address', () => {
  expect(forwarded({ 'cf-connecting-ip': '2001:db8::1' })).toBe('2001:db8::1')
})
