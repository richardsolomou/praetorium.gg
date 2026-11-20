import { expect, it } from 'vitest'
import { consentDestination } from './consentDestination'

it('names where a connection sends the player, whatever the client calls itself', () => {
  expect(
    [
      'https://claude.ai/api/mcp/auth_callback',
      'https://claude.ai@elsewhere.example/callback',
      'http://127.0.0.1:53211/callback',
      'cursor://anysphere.cursor-mcp/oauth/callback',
      'nonsense',
    ].map(consentDestination),
  ).toEqual(['claude.ai', 'elsewhere.example', 'an app on this device', 'an app on this device', null])
})
