import { expect, it } from 'vitest'
import { moduleEnvironmentHeaders } from 'ras-stack/spacetime'
import { moduleEnvironment } from './spacetimeEnvironment'

const auth = { issuer: 'https://praetorium.gg/api/auth', audience: 'praetorium-production', operator: 'ab'.repeat(32) }

it('sends each auth setting as its own environment header', () => {
  expect(moduleEnvironmentHeaders(moduleEnvironment(auth))).toEqual([
    ['spacetime-environment', 'AUTH_ISSUER=https://praetorium.gg/api/auth'],
    ['spacetime-environment', 'AUTH_AUDIENCE=praetorium-production'],
    ['spacetime-environment', `OPERATOR_IDENTITY=${'ab'.repeat(32)}`],
  ])
})

it.each([',', '"', "'", '\\', ' '])('refuses a value SpacetimeDB would read differently (%j)', (character) => {
  expect(() => moduleEnvironmentHeaders(moduleEnvironment({ ...auth, audience: `praetorium${character}production` }))).toThrow(
    'Invalid AUTH_AUDIENCE',
  )
})
