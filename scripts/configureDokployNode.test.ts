import { expect, it, vi } from 'vitest'
import { ensureWebDomain, nodeEnvironment } from './configureDokployNode'

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
  await ensureWebDomain(new URL('https://dokploy.example'), { 'x-api-key': 'test' }, 'web-id', 'staging.praetorium.gg', request)
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
  await expect(
    ensureWebDomain(new URL('https://dokploy.example'), { 'x-api-key': 'test' }, 'web-id', 'praetorium.gg', request),
  ).rejects.toThrow('differs from the verified configuration')
})
