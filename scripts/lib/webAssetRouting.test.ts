import { expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { withoutBucketAssetRoute } from './webAssetRouting'

const replicas = {
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
}
const throughBucket = stringify({
  http: {
    routers: {
      ...replicas.http.routers,
      'web-assets': { rule: 'Host(`praetorium.gg`) && PathPrefix(`/assets/`)', service: 'web-assets', entryPoints: ['websecure'] },
    },
    services: { ...replicas.http.services, 'web-assets': { loadBalancer: { servers: [{ url: 'https://s3.praetorium.gg' }] } } },
    middlewares: { ...replicas.http.middlewares, 'web-assets-path': { replacePathRegex: {} }, 'web-assets-errors': { errors: {} } },
  },
})

it('leaves assets to the replicas, keeping every other route, service and middleware', () => {
  expect(parse(withoutBucketAssetRoute(throughBucket, 'praetorium.gg'))).toEqual(replicas)
})
it('changes nothing once assets reach the replicas', () => {
  const source = stringify(replicas)
  expect(withoutBucketAssetRoute(source, 'praetorium.gg')).toBe(source)
})
it('rejects a different host before changing anything', () => {
  expect(() => withoutBucketAssetRoute(throughBucket, 'staging.praetorium.gg')).toThrow('Expected one HTTPS web router')
})
