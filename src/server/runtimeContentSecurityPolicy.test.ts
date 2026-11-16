import { expect, it } from 'vitest'
import { runtimeContentSecurityPolicy } from './runtimeContentSecurityPolicy'

const base = "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self'"
const imageOrigin = 'https://images.example'

it('allows bundled combat workers without allowing dynamic scripts', () => {
  expect(runtimeContentSecurityPolicy(base, imageOrigin, false)).toContain("worker-src 'self' blob:")
})

it('preserves existing worker origins', () => {
  expect(runtimeContentSecurityPolicy(`${base}; worker-src https://workers.example`, imageOrigin, true)).toContain(
    'worker-src https://workers.example blob:',
  )
})

it('allows SpacetimeDB binary codecs in the hosted browser', () => {
  expect(runtimeContentSecurityPolicy(base, imageOrigin, true)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
})

it('keeps local pages free of dynamic code evaluation', () => {
  expect(runtimeContentSecurityPolicy(base, imageOrigin, false)).not.toContain("'unsafe-eval'")
})

it('does not duplicate runtime allowances', () => {
  const once = runtimeContentSecurityPolicy(base, imageOrigin, true)
  expect(runtimeContentSecurityPolicy(once, imageOrigin, true)).toBe(once)
})

it('adds the allowance to script-src even when another directive contains it', () => {
  const policy = base.replace("default-src 'self'", "default-src 'self' 'unsafe-eval'")
  expect(runtimeContentSecurityPolicy(policy, imageOrigin, true)).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
})
