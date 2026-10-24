import { expect, it } from 'vitest'
import { MCP_CONSENT_REFUSALS, mcpConsentRefusal } from './mcpConsent'

it('recognises an expired request once it has crossed the wire', () => {
  expect(mcpConsentRefusal(new Error(MCP_CONSENT_REFUSALS.expired))).toBe('expired')
})

it('recognises an app that is no longer registered', () => {
  expect(mcpConsentRefusal(new Error(MCP_CONSENT_REFUSALS.unknown_client))).toBe('unknown_client')
})

it('leaves a genuine failure alone', () => {
  expect(mcpConsentRefusal(new Error('something broke'))).toBeNull()
})

it('leaves a non-error rejection alone', () => {
  expect(mcpConsentRefusal(MCP_CONSENT_REFUSALS.expired)).toBeNull()
})
