import { expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { webAssetRouting } from './webAssetRouting'

const source = stringify({
  http: {
    routers: {
      web: {
        rule: 'Host(`praetorium.gg`)',
        service: 'app',
        entryPoints: ['websecure'],
        tls: { certResolver: 'letsencrypt' },
        middlewares: ['auth'],
      },
      redirect: { rule: 'Host(`praetorium.gg`)', service: 'app', entryPoints: ['web'], middlewares: ['redirect'] },
    },
    services: { app: { loadBalancer: { servers: [{ url: 'http://app:3000' }] } } },
    middlewares: { auth: { headers: {} } },
  },
})

it('preserves app routes, TLS and middleware while routing assets away from replicas', () => {
  const result = parse(webAssetRouting(source, 'praetorium.gg'))
  const original = parse(source)
  expect({
    web: result.http.routers.web,
    redirect: result.http.routers.redirect,
    app: result.http.services.app,
    auth: result.http.middlewares.auth,
  }).toEqual({
    web: original.http.routers.web,
    redirect: original.http.routers.redirect,
    app: original.http.services.app,
    auth: original.http.middlewares.auth,
  })
  expect(result.http.routers['web-assets']).toMatchObject({
    service: 'web-assets',
    tls: { certResolver: 'letsencrypt' },
    priority: 101,
    middlewares: ['auth', 'web-assets-errors', 'web-assets-path', 'web-assets-headers'],
  })
})
it('keeps failures uncached through the existing asset miss handler', () => {
  expect(parse(webAssetRouting(source, 'praetorium.gg')).http.middlewares['web-assets-errors']).toEqual({
    errors: { status: ['400-599'], service: 'app', query: '/assets/unavailable-{status}.js' },
  })
})
it('is idempotent across releases', () => {
  const first = webAssetRouting(source, 'praetorium.gg')
  expect(webAssetRouting(first, 'praetorium.gg')).toBe(first)
})
it('rejects a different host before changing anything', () => {
  expect(() => webAssetRouting(source, 'staging.praetorium.gg')).toThrow('Expected one HTTPS web router')
})
