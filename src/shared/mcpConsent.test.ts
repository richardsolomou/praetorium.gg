import { expect, it } from 'vitest'
import { MCP_CONSENT_REFUSALS, mcpConsentDestination, mcpConsentRefusal } from './mcpConsent'

it('leaves a non-error rejection alone', () => {
  expect(mcpConsentRefusal(MCP_CONSENT_REFUSALS.expired)).toBeNull()
})

it('names where a connection sends the player, whatever the client calls itself', () => {
  expect(
    [
      'https://claude.ai/api/mcp/auth_callback',
      'http://127.0.0.1:53211/callback',
      'cursor://anysphere.cursor-mcp/oauth/callback',
      'nonsense',
    ].map(mcpConsentDestination),
  ).toEqual(['claude.ai', 'an app on this device', 'an app on this device', null])
})
