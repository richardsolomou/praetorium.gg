import { describe, expect, it } from 'vitest'
import {
  nativeAuthConsumeScript,
  nativeAuthExchangeScript,
  nativeAuthStartUrl,
  parseNativeAuthCallback,
  parseNativeAuthRequest,
} from './nativeAuth'

describe('native authentication bridge', () => {
  const proof = { challenge: 'c'.repeat(43), verifier: 'v'.repeat(43) }
  const request = {
    version: 2,
    type: 'native-auth',
    action: 'sign-in',
    provider: 'google',
    next: '/battles/abc?seat=def',
    requestSignUp: false,
    ...proof,
  }
  const callback = {
    kind: 'success' as const,
    token: 'secret-token-1234',
    id: 'exchange-id-123456789012345678901',
    provider: 'google' as const,
    action: 'sign-in' as const,
    next: '/rosters',
    ...proof,
  }

  it('accepts a bounded first-party request', () => {
    expect(parseNativeAuthRequest(JSON.stringify(request))).toEqual({
      action: 'sign-in',
      provider: 'google',
      next: '/battles/abc?seat=def',
      requestSignUp: false,
      ...proof,
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
      nativeAuthStartUrl({
        action: 'link',
        provider: 'discord',
        next: '/profile',
        requestSignUp: false,
        sessionToken: 'secret-token',
        ...proof,
      }),
    )
    expect(url.searchParams.has('session')).toBe(false)
    expect(url.searchParams.get('bridge')).toBe('2')
    expect(url.searchParams.get('challenge')).toBe(proof.challenge)
    expect(new URLSearchParams(url.hash.slice(1)).get('session')).toBe('secret-token')
  })

  it('accepts only the configured callback scheme', () => {
    expect(
      parseNativeAuthCallback(
        `praetorium://auth?version=2&challenge=${proof.challenge}&id=${'i'.repeat(32)}&token=${'t'.repeat(32)}&provider=google&action=sign-in&next=%2Frosters`,
        proof,
      ),
    ).toEqual({
      kind: 'success',
      id: 'i'.repeat(32),
      token: 't'.repeat(32),
      provider: 'google',
      action: 'sign-in',
      next: '/rosters',
      ...proof,
    })
    expect(parseNativeAuthCallback('https://example.com/?token=1234567890123456&provider=google&action=sign-in&next=%2Frosters')).toEqual({
      kind: 'error',
    })
    expect(
      parseNativeAuthCallback(
        `praetorium://auth?version=2&challenge=${proof.challenge}&id=${'i'.repeat(32)}&token=${'t'.repeat(32)}&provider=google&action=sign-in&next=%2Frosters`,
        { ...proof, challenge: 'x'.repeat(43) },
      ),
    ).toEqual({ kind: 'error' })
  })

  it('exchanges the token in a request body rather than a URL', () => {
    const script = nativeAuthExchangeScript(callback)
    expect(script).toContain("fetch('/api/auth/native-auth-token/exchange'")
    expect(script).toContain('body: JSON.stringify({ id: auth.id, token: auth.token, verifier: auth.verifier })')
    expect(script).toContain('window.location.replace(exchange.next)')
    expect(script).not.toContain('window.location.replace(auth.next)')
    expect(script).not.toContain('?token=')
  })

  it('acknowledges the same exchange proof after native persistence succeeds', () => {
    const script = nativeAuthConsumeScript(callback)

    expect(script).toContain("fetch('/api/auth/native-auth-token/consume'")
    expect(script).toContain('exchange-id-123456789012345678901')
    expect(script).toContain(proof.verifier)
  })
})
