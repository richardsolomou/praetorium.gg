import { expect, it } from 'vitest'
import { nodeEnvironment, withoutAuthImport } from './configureDokployNode'

const environment = {
  AUTH_SECRET: 's'.repeat(64),
  AUTH_IMPORT_R2_KEY: `backups/auth/import/staging/${'a'.repeat(64)}.sql.gz`,
  SPACETIME_URL: 'https://stdb-staging.praetorium.gg/',
  SPACETIME_OPERATOR_TOKEN: 'operator',
  SPACETIME_ACCESS_CLIENT_ID: 'client-id',
  SPACETIME_ACCESS_CLIENT_SECRET: 'client-secret',
  R2_ACCOUNT_ID: 'b'.repeat(32),
  R2_ACCESS_KEY_ID: 'r2-id',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
}

it('pins staging auth import, database, and audience together', () => {
  const config = nodeEnvironment(environment, 'staging')
  expect(config).toContain('SPACETIME_DATABASE=praetorium-staging\nSPACETIME_AUDIENCE=praetorium-staging\n')
  expect(config).toContain(`AUTH_IMPORT_R2_KEY=${environment.AUTH_IMPORT_R2_KEY}\n`)
})

it('rejects a production import in staging', () => {
  expect(() =>
    nodeEnvironment({ ...environment, AUTH_IMPORT_R2_KEY: environment.AUTH_IMPORT_R2_KEY.replace('staging', 'production') }, 'staging'),
  ).toThrow('Auth import belongs to a different environment')
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
  expect(withoutAuthImport(configured)).toBe(configured.replace(`AUTH_IMPORT_R2_KEY=${environment.AUTH_IMPORT_R2_KEY}\n`, ''))
})
