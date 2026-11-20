import { describe, expect, it } from 'vitest'
import { nativeAuthProofRequest } from './nativeAuthToken'

describe('native authentication proof requests', () => {
  it.each([
    ['/native-auth-token/exchange', undefined, 'https://praetorium.gg'],
    ['/native-auth-token/consume', 'null', 'https://praetorium.gg'],
    ['/native-auth-token/generate', undefined, null],
  ])('normalizes the origin for %s from %s', (endpoint, origin, expected) => {
    const headers = new Headers({ cookie: 'better-auth.session_token=webview-cookie' })
    if (origin) headers.set('origin', origin)
    const request = new Request(`https://praetorium.gg/api/auth${endpoint}`, { method: 'POST', headers, body: '{}' })

    expect(nativeAuthProofRequest(request, 'https://praetorium.gg/api/auth').headers.get('origin')).toBe(expected)
  })

  it.each<Record<string, string>>([{ origin: 'https://example.com' }, { 'sec-fetch-site': 'cross-site' }])(
    'refuses a proof another site posts: %o',
    (headers) => {
      const request = new Request('https://praetorium.gg/api/auth/native-auth-token/exchange', { method: 'POST', headers, body: '{}' })
      expect(nativeAuthProofRequest(request, 'https://praetorium.gg/api/auth')).toHaveProperty('status', 403)
    },
  )

  it('reconstructs a request supplied by another server runtime', async () => {
    const body = new TextEncoder().encode('{"proof":true}')
    const request = {
      body: new Response(body).body,
      headers: new Headers({ cookie: 'better-auth.session_token=webview-cookie' }),
      method: 'POST',
      url: 'https://praetorium.gg/api/auth/native-auth-token/exchange',
    } as Request

    const normalized = nativeAuthProofRequest(request, 'https://praetorium.gg/api/auth')

    expect(await normalized.text()).toBe('{"proof":true}')
  })
})
