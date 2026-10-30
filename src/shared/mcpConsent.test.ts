import { expect, it } from 'vitest'
import { MCP_CONSENT_REFUSALS, mcpConsentRefusal } from './mcpConsent'

it('leaves a non-error rejection alone', () => {
  expect(mcpConsentRefusal(MCP_CONSENT_REFUSALS.expired)).toBeNull()
})
