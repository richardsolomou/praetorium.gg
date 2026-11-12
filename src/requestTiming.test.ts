import { createRootRoute, createRoute } from '@tanstack/react-router'
import { expect, it, vi } from 'vitest'
import { recordRequest, routePatterns } from './requestTiming'

const root = createRootRoute()
const battles = createRoute({ getParentRoute: () => root, path: '/battles' })
const battle = createRoute({ getParentRoute: () => battles, path: '$token' })
const release = createRoute({ getParentRoute: () => root, path: '/api/release' })
const routeTree = root.addChildren([battles.addChildren([battle]), release])

it('names a request by its route pattern, never its token', () => {
  expect(routePatterns(routeTree)('/battles/secret-token')).toBe('/battles/$token')
})

it('names an address no route serves as unmatched', () => {
  expect(routePatterns(routeTree)('/wp-admin/setup.php')).toBe('unmatched')
})

const telemetry = () => ({ metrics: { count: vi.fn(), histogram: vi.fn() }, log: vi.fn() })

it('times every request by its route', () => {
  const sink = telemetry()
  recordRequest(sink, { method: 'GET', route: '/api/release', status: 200, durationMs: 40 })
  expect(sink.metrics.histogram).toHaveBeenCalledWith('http_server.duration', 40, {
    unit: 'ms',
    attributes: { method: 'GET', route: '/api/release', outcome: 'success', status_class: '2xx' },
  })
})

it('logs a slow request', () => {
  const sink = telemetry()
  recordRequest(sink, { method: 'GET', route: '/api/release', status: 200, durationMs: 9_000 })
  expect(sink.log).toHaveBeenCalledWith(
    expect.objectContaining({ body: 'slow request', attributes: expect.objectContaining({ duration_ms: 9_000 }) }),
  )
})

it('logs a request the server failed', () => {
  const sink = telemetry()
  recordRequest(sink, { method: 'GET', route: '/battles/$token', status: 503, durationMs: 5 })
  expect(sink.log).toHaveBeenCalledWith(
    expect.objectContaining({ body: 'request failed', attributes: expect.objectContaining({ status: 503 }) }),
  )
})

it('does not log a quick answer', () => {
  const sink = telemetry()
  recordRequest(sink, { method: 'GET', route: '/battles/$token', status: 404, durationMs: 5 })
  expect(sink.log).not.toHaveBeenCalled()
})

it('names an unusual method as other', () => {
  const sink = telemetry()
  recordRequest(sink, { method: 'PROPFIND', route: 'unmatched', status: 404, durationMs: 5 })
  expect(sink.metrics.count).toHaveBeenCalledWith('http_server.requests', 1, { attributes: expect.objectContaining({ method: 'other' }) })
})
