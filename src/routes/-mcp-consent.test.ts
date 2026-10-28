import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { MCP_CONSENT_REFUSALS } from '../shared/mcpConsent'

const captureException = vi.hoisted(() => vi.fn())
const capture = vi.hoisted(() => vi.fn())
vi.mock('posthog-js', () => ({ posthog: { captureException, capture, __loaded: true } }))

import { Route } from './mcp-consent'

const onCatch = Route.options.onCatch as (error: Error) => void
const ErrorPage = Route.options.errorComponent as ComponentType<{ error: Error; reset: () => void }>
const renderError = (error: Error) => renderToStaticMarkup(createElement(ErrorPage, { error, reset: () => {} }))

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

it('tells the person an expired request has expired', () => {
  expect(renderError(new Error(MCP_CONSENT_REFUSALS.expired))).toContain('This connection request has expired')
})

it('tells the person an app is no longer registered', () => {
  expect(renderError(new Error(MCP_CONSENT_REFUSALS.unknown_client))).toContain('This app is no longer registered')
})

it('offers a retry for a genuine failure instead of claiming the request expired', () => {
  expect(renderError(new Error('something broke'))).toContain('data-route-error')
})
