import { beforeEach, expect, it, vi } from 'vitest'
import { MCP_CONSENT_REFUSALS } from '../shared/mcpConsent'

const captureException = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
vi.mock('posthog-js', () => ({ posthog: { captureException, capture } }))

import { Route } from './mcp-consent'

const onCatch = Route.options.onCatch as (error: Error) => void

beforeEach(() => {
  captureException.mockClear()
  capture.mockClear()
})

it('leaves an expired request out of error tracking', () => {
  onCatch(new Error(MCP_CONSENT_REFUSALS.expired))
  expect(captureException).not.toHaveBeenCalled()
})

it('counts an expired request by its reason', () => {
  onCatch(new Error(MCP_CONSENT_REFUSALS.expired))
  expect(capture.mock.calls).toEqual([['mcp_consent_refused', { reason: 'expired' }]])
})

it('counts an app that is no longer registered by its reason', () => {
  onCatch(new Error(MCP_CONSENT_REFUSALS.unknown_client))
  expect(capture.mock.calls).toEqual([['mcp_consent_refused', { reason: 'unknown_client' }]])
})

it('reports a genuine failure', () => {
  const error = new TypeError("Cannot read properties of undefined (reading 'client_id')")
  onCatch(error)
  expect(captureException.mock.calls).toEqual([[error, { operation: 'route' }]])
})
