import { describe, expect, it } from 'vitest'
import { nativeAuthProofRequest } from './nativeAuthToken'

describe('native authentication proof requests', () => {
  it.each([
    ['/native-auth-token/exchange', undefined, 'https://praetorium.gg'],
    ['/native-auth-token/consume', 'null', 'https://praetorium.gg'],
    ['/native-auth-token/generate', undefined, null],
    ['/native-auth-token/exchange', 'https://example.com', 'https://example.com'],
  ])('normalizes the origin for %s from %s', (endpoint, origin, expected) => {
    const headers = new Headers({ cookie: 'better-auth.session_token=webview-cookie' })
    if (origin) headers.set('origin', origin)
    const request = new Request(`https://praetorium.gg/api/auth${endpoint}`, { method: 'POST', headers, body: '{}' })

    expect(nativeAuthProofRequest(request, 'https://praetorium.gg/api/auth').headers.get('origin')).toBe(expected)
  })
})
