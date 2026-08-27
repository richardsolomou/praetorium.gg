import { describe, expect, it } from 'vitest'
import { nativeAuthExchangeScript, nativeAuthStartUrl, parseNativeAuthCallback, parseNativeAuthRequest } from './nativeAuth'

describe('native authentication bridge', () => {
  const request = {
    version: 1,
    type: 'native-auth',
    action: 'sign-in',
    provider: 'google',
    next: '/battles/abc?seat=def',
    requestSignUp: false,
  }

  it('accepts a bounded first-party request', () => {
    expect(parseNativeAuthRequest(JSON.stringify(request))).toEqual({
      action: 'sign-in',
      provider: 'google',
      next: '/battles/abc?seat=def',
      requestSignUp: false,
    })
  })

  it('requires a one-time session token when linking', () => {
    expect(parseNativeAuthRequest(JSON.stringify({ ...request, action: 'link' }))).toBeNull()
    expect(parseNativeAuthRequest(JSON.stringify({ ...request, action: 'link', sessionToken: 'a'.repeat(32) }))).toMatchObject({
      action: 'link',
      sessionToken: 'a'.repeat(32),
    })
  })

  it('rejects unsupported providers and external redirects', () => {
    expect(parseNativeAuthRequest(JSON.stringify({ ...request, provider: 'other' }))).toBeNull()
    expect(parseNativeAuthRequest(JSON.stringify({ ...request, next: '//example.com' }))).toBeNull()
  })

  it('keeps a linking session token out of the HTTP request', () => {
    const url = new URL(
      nativeAuthStartUrl({ action: 'link', provider: 'discord', next: '/profile', requestSignUp: false, sessionToken: 'secret-token' }),
    )
    expect(url.searchParams.has('session')).toBe(false)
    expect(new URLSearchParams(url.hash.slice(1)).get('session')).toBe('secret-token')
  })

  it('accepts only the configured callback scheme', () => {
    expect(parseNativeAuthCallback('praetorium://auth?token=1234567890123456&provider=google&action=sign-in&next=%2Frosters')).toEqual({
      kind: 'success',
      token: '1234567890123456',
      provider: 'google',
      action: 'sign-in',
      next: '/rosters',
    })
    expect(parseNativeAuthCallback('https://example.com/?token=1234567890123456&provider=google&action=sign-in&next=%2Frosters')).toEqual({
      kind: 'error',
    })
  })

  it('exchanges the token in a request body rather than a URL', () => {
    const script = nativeAuthExchangeScript({
      kind: 'success',
      token: 'secret-token-1234',
      provider: 'google',
      action: 'sign-in',
      next: '/rosters',
    })
    expect(script).toContain("fetch('/api/auth/one-time-token/verify'")
    expect(script).toContain('body: JSON.stringify({ token: auth.token })')
    expect(script).not.toContain('?token=')
  })
})
