import { expect, it, vi } from 'vitest'
import { configureWebAssetRoute, ensureWebDomain, ensureWebHealthCheck, nodeEnvironment } from './configureDokployNode'
import { dokployApi } from './lib/dokployWeb'

const dokploy = (request: typeof fetch) => dokployApi('https://dokploy.example', 'test', 'environment', request)

const environment = {
  AUTH_SECRET: 's'.repeat(64),
  SPACETIME_URL: 'https://stdb-staging.praetorium.gg/',
  SPACETIME_INTERNAL_HOST: 'praetoriumgg-spacetimedb-sjtfrn',
  SPACETIME_OPERATOR_TOKEN: 'operator',
  SPACETIME_ACCESS_CLIENT_ID: 'client-id',
  SPACETIME_ACCESS_CLIENT_SECRET: 'client-secret',
  R2_ACCOUNT_ID: 'b'.repeat(32),
  R2_ACCESS_KEY_ID: 'r2-id',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  ASSETS_R2_ACCESS_KEY_ID: 'assets-id',
  ASSETS_R2_SECRET_ACCESS_KEY: 'assets-secret',
}

it('allows the first catalogue download and compilation before declaring a cold server unhealthy', async () => {
  let saved: unknown
  const request: typeof fetch = async (_url, options) => {
    if (options?.method === 'POST') {
      saved = JSON.parse(options.body as string)
      return Response.json(true)
    }
    return Response.json(saved)
  }
  await ensureWebHealthCheck(dokploy(request), 'web-id')
  expect(saved).toEqual({
    applicationId: 'web-id',
    healthCheckSwarm: {
      Test: ['CMD', 'node', '/app/scripts/healthcheck.ts'],
      Interval: 10_000_000_000,
      Timeout: 10_000_000_000,
      StartPeriod: 1_800_000_000_000,
      Retries: 3,
    },
  })
})

it('rejects a health check update that Dokploy does not save', async () => {
  const request: typeof fetch = async (_url, options) =>
    options?.method === 'POST' ? Response.json(true) : Response.json({ applicationId: 'web-id', healthCheckSwarm: null })
  await expect(ensureWebHealthCheck(dokploy(request), 'web-id')).rejects.toThrow('Dokploy health check did not persist')
})

it('stops configuration when Dokploy rejects the health check', async () => {
  const request = vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch
  await expect(ensureWebHealthCheck(dokploy(request), 'web-id')).rejects.toThrow('application.update failed with 500')
  expect(request).toHaveBeenCalledTimes(1)
})

it('pins the staging database and audience together', () => {
  const config = nodeEnvironment(environment, 'staging')
  expect(config).toContain('SPACETIME_URL=http://praetoriumgg-spacetimedb-sjtfrn:3000/\n')
  expect(config).not.toContain('SPACETIME_ACCESS_CLIENT_SECRET=')
  expect(config).toContain('SPACETIME_DATABASE=praetorium-staging\nSPACETIME_AUDIENCE=praetorium-staging\n')
  expect(config).toContain('ASSETS_R2_ACCESS_KEY_ID=assets-id')
  expect(config).not.toMatch(/^R2_ACCESS_KEY_ID=/m)
})

it('keeps private backup credentials only in production', () => {
  const config = nodeEnvironment(
    { ...environment, APPLE_CLIENT_ID: 'apple', APPLE_TEAM_ID: 'team', APPLE_KEY_ID: 'key', APPLE_PRIVATE_KEY: 'private' },
    'production',
  )
  expect(config).toContain('R2_ACCESS_KEY_ID=r2-id')
})

const github = { GITHUB_CLIENT_ID: 'github-id', GITHUB_CLIENT_SECRET: 'github-secret', GITHUB_SPONSORS_TOKEN: 'sponsors-token' }
const apple = { APPLE_CLIENT_ID: 'apple', APPLE_TEAM_ID: 'team', APPLE_KEY_ID: 'key', APPLE_PRIVATE_KEY: 'private' }

it('publishes the live catalogue for releases from production only', () => {
  expect(
    [nodeEnvironment({ ...environment, ...apple }, 'production'), nodeEnvironment(environment, 'staging')].map((config) =>
      config.includes('CATALOGUE_LIVE_ARCHIVE=production'),
    ),
  ).toEqual([true, false])
})

it('passes GitHub sponsor linking to production', () => {
  expect(nodeEnvironment({ ...environment, ...apple, ...github }, 'production')).toContain(
    'GITHUB_CLIENT_ID=github-id\nGITHUB_CLIENT_SECRET=github-secret\nGITHUB_SPONSORS_TOKEN=sponsors-token',
  )
})

it('leaves GitHub sponsor linking out of staging, whose address the OAuth app does not answer', () => {
  expect(nodeEnvironment({ ...environment, ...github }, 'staging')).not.toContain('GITHUB_')
})

it('passes the IndexNow key to production', () => {
  expect(nodeEnvironment({ ...environment, ...apple, INDEXNOW_KEY: 'index-key' }, 'production')).toContain('INDEXNOW_KEY=index-key')
})

it('passes the photo screening key to production only', () => {
  expect(
    [
      nodeEnvironment({ ...environment, ...apple, TYPESAFE_API_KEY: 'screening-key' }, 'production'),
      nodeEnvironment({ ...environment, TYPESAFE_API_KEY: 'screening-key' }, 'staging'),
    ].map((config) => config.includes('TYPESAFE_API_KEY=screening-key')),
  ).toEqual([true, false])
})

it.each(['POSTHOG_SUPPORT_IDENTITY_SECRET', 'POSTHOG_SUPPORT_API_KEY', 'SUPPORT_REPLY_WEBHOOK_SECRET'])(
  'passes %s to production only, so previews never reach the Support inbox or its players',
  (name) => {
    expect(
      [
        nodeEnvironment({ ...environment, ...apple, [name]: 'support-secret' }, 'production'),
        nodeEnvironment({ ...environment, [name]: 'support-secret' }, 'staging'),
      ].map((config) => config.includes(`${name}=support-secret`)),
    ).toEqual([true, false])
  },
)

it('leaves the IndexNow key out of staging, whose pages search engines should not be told about', () => {
  expect(nodeEnvironment({ ...environment, INDEXNOW_KEY: 'index-key' }, 'staging')).not.toContain('INDEXNOW_KEY')
})

it('rejects an external SpacetimeDB host for the VM runtime', () => {
  expect(() => nodeEnvironment({ ...environment, SPACETIME_INTERNAL_HOST: 'stdb-staging.praetorium.gg' }, 'staging')).toThrow(
    'Invalid SpacetimeDB internal host',
  )
})

it('keeps a multiline Apple key on one environment line', () => {
  const privateKey = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----'
  const config = nodeEnvironment(
    {
      ...environment,
      APPLE_CLIENT_ID: 'gg.praetorium.web',
      APPLE_TEAM_ID: 'team',
      APPLE_KEY_ID: 'key-id',
      APPLE_PRIVATE_KEY: privateKey,
    },
    'production',
  )
  const encoded = config.match(/^APPLE_PRIVATE_KEY_BASE64=(.*)$/m)?.[1]
  expect(Buffer.from(encoded ?? '', 'base64').toString('utf8')).toBe(privateKey)
})

it('creates one HTTPS domain for the selected web application', async () => {
  let domains: unknown[] = []
  const request = vi.fn(async (url: URL, init?: RequestInit) => {
    if (url.pathname.endsWith('domain.create')) {
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON body')
      expect(JSON.parse(init.body)).toEqual({
        applicationId: 'web-id',
        host: 'staging.praetorium.gg',
        path: '/',
        port: 3000,
        https: true,
        certificateType: 'letsencrypt',
        domainType: 'application',
      })
      domains = [{ ...JSON.parse(init.body), domainId: 'domain-id', enabled: true }]
    }
    return Response.json(domains)
  }) as typeof fetch
  await ensureWebDomain(dokploy(request), 'web-id', 'staging.praetorium.gg')
  expect(request).toHaveBeenCalledTimes(3)
})

it('rejects a web domain with TLS disabled', async () => {
  const request = vi.fn(async () =>
    Response.json([
      {
        domainId: 'domain-id',
        applicationId: 'web-id',
        host: 'praetorium.gg',
        path: '/',
        port: 3000,
        https: false,
        certificateType: 'none',
        domainType: 'application',
        enabled: true,
      },
    ]),
  ) as typeof fetch
  await expect(ensureWebDomain(dokploy(request), 'web-id', 'praetorium.gg')).rejects.toThrow('differs from the verified configuration')
})

it('restores the previous asset route if hosted verification fails', async () => {
  const original =
    'http:\n  routers:\n    web:\n      rule: Host(`praetorium.gg`)\n      service: app\n      entryPoints: [websecure]\n      tls: {certResolver: letsencrypt}\n  services:\n    app: {loadBalancer: {servers: [{url: "http://app:3000"}]}}\n'
  let current = original
  const writes: string[] = []
  const request: typeof fetch = async (_url, options) => {
    if (options?.method === 'POST') {
      current = JSON.parse(options.body as string).traefikConfig
      writes.push(current)
      return Response.json(true)
    }
    return Response.json(current)
  }
  await expect(
    configureWebAssetRoute(dokploy(request), 'web', 'praetorium.gg', ['/assets'], {
      wait: async () => {},
      verify: async () => {
        throw new Error('CDN unavailable')
      },
    }),
  ).rejects.toThrow('CDN unavailable')
  expect(writes.at(-1)).toBe(original)
  expect(writes[0]).toContain('web-assets')
})
