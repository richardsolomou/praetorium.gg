import { expect, it } from 'vitest'
import { contentSecurityPolicy } from './contentSecurityPolicy'

const base = "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self'"
const imageOrigin = 'https://images.example'

it('allows SpacetimeDB binary codecs in the hosted browser', () => {
  expect(contentSecurityPolicy(base, imageOrigin, true)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
})

it('keeps self-hosted pages free of dynamic code evaluation', () => {
  expect(contentSecurityPolicy(base, imageOrigin, false)).not.toContain("'unsafe-eval'")
})

it('does not duplicate runtime allowances', () => {
  const once = contentSecurityPolicy(base, imageOrigin, true)
  expect(contentSecurityPolicy(once, imageOrigin, true)).toBe(once)
})

it('adds the allowance to script-src even when another directive contains it', () => {
  const policy = base.replace("default-src 'self'", "default-src 'self' 'unsafe-eval'")
  expect(contentSecurityPolicy(policy, imageOrigin, true)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
})
