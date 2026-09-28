import { expect, it } from 'vitest'
import { nodeEnvironment, withoutAuthImport } from './configureDokployNode'

const environment = {
  AUTH_SECRET: 's'.repeat(64),
  AUTH_IMPORT_R2_KEY: `backups/auth/import/staging/${'a'.repeat(64)}.sql.gz`,
  SPACETIME_URL: 'https://stdb-staging.praetorium.gg/',
  SPACETIME_INTERNAL_HOST: 'praetoriumgg-spacetimedb-sjtfrn',
  SPACETIME_OPERATOR_TOKEN: 'operator',
  SPACETIME_ACCESS_CLIENT_ID: 'client-id',
  SPACETIME_ACCESS_CLIENT_SECRET: 'client-secret',
  R2_ACCOUNT_ID: 'b'.repeat(32),
  R2_ACCESS_KEY_ID: 'r2-id',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
}

it('pins staging auth import, database, and audience together', () => {
  const config = nodeEnvironment(environment, 'staging')
  expect(config).toContain('SPACETIME_URL=http://praetoriumgg-spacetimedb-sjtfrn:3000/\n')
  expect(config).not.toContain('SPACETIME_ACCESS_CLIENT_SECRET=')
  expect(config).toContain('SPACETIME_DATABASE=praetorium-staging\nSPACETIME_AUDIENCE=praetorium-staging\n')
  expect(config).toContain(`AUTH_IMPORT_R2_KEY=${environment.AUTH_IMPORT_R2_KEY}`)
})

it('rejects an external SpacetimeDB host for the VM runtime', () => {
  expect(() => nodeEnvironment({ ...environment, SPACETIME_INTERNAL_HOST: 'stdb-staging.praetorium.gg' }, 'staging')).toThrow(
    'Invalid SpacetimeDB internal host',
  )
})

it('rejects a production import in staging', () => {
  expect(() =>
    nodeEnvironment({ ...environment, AUTH_IMPORT_R2_KEY: environment.AUTH_IMPORT_R2_KEY.replace('staging', 'production') }, 'staging'),
  ).toThrow('Auth import belongs to a different environment')
})

it('requires an existing auth file on later deployments instead of replaying an old export', () => {
  const config = nodeEnvironment({ ...environment, AUTH_IMPORT_R2_KEY: '' }, 'staging')
  expect(config).not.toContain('AUTH_IMPORT_R2_KEY=')
})

it('keeps a multiline Apple key on one environment line', () => {
  const privateKey = '-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----'
  const config = nodeEnvironment(
    {
      ...environment,
      AUTH_IMPORT_R2_KEY: environment.AUTH_IMPORT_R2_KEY.replace('staging', 'production'),
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

it('removes the import key after verification without changing other credentials', () => {
  const configured = nodeEnvironment(environment, 'staging')
  expect(withoutAuthImport(configured)).toBe(configured.replace(`\nAUTH_IMPORT_R2_KEY=${environment.AUTH_IMPORT_R2_KEY}`, ''))
})
