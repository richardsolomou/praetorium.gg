import { expect, it } from 'vitest'
import { previewOAuthPostRequest, previewOidcRequest } from './previewOidc'

const issuer = `https://pr-606.praetorium.gg/api/auth/preview/${'c'.repeat(40)}`

it('routes revisioned JWKS and OAuth endpoints to Better Auth', () => {
  for (const path of ['/jwks', '/oauth2/authorize']) {
    const request = new Request(`${issuer}${path}`)
    expect(previewOidcRequest(request, issuer).url).toBe(`https://pr-606.praetorium.gg/api/auth${path}`)
  }
})

it('leaves other hosts, paths, and methods unchanged', () => {
  for (const request of [
    new Request('https://other.example/api/auth/preview/' + 'c'.repeat(40) + '/jwks'),
    new Request(`${issuer}/.well-known/openid-configuration`),
    new Request(`${issuer}/jwks/extra`),
    new Request(`${issuer}/jwks`, { method: 'POST' }),
  ]) {
    expect(previewOidcRequest(request, issuer)).toBe(request)
  }
})

it('rebuilds a foreign request from its URL and headers', () => {
  const foreign = {
    url: `${issuer}/jwks`,
    method: 'GET',
    headers: new Headers({ 'x-test': 'foreign' }),
  } as Request
  const rewritten = previewOidcRequest(foreign, issuer)
  expect(rewritten.url).toBe('https://pr-606.praetorium.gg/api/auth/jwks')
  expect(rewritten.headers.get('x-test')).toBe('foreign')
})

it('routes metadata through a TLS terminating proxy', () => {
  const request = new Request(`http://pr-606.praetorium.gg/api/auth/preview/${'c'.repeat(40)}/jwks`)
  expect(previewOidcRequest(request, issuer, 'https://pr-606.praetorium.gg').url).toBe('http://pr-606.praetorium.gg/api/auth/jwks')
})

it('routes a preview token request without copying a foreign Request implementation', async () => {
  const foreign = {
    url: `${issuer}/oauth2/token`,
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    arrayBuffer: async () => new TextEncoder().encode('grant_type=authorization_code').buffer,
  } as Request
  const rewritten = await previewOAuthPostRequest(foreign, issuer)
  expect({ url: rewritten.url, method: rewritten.method, body: await rewritten.text() }).toEqual({
    url: 'https://pr-606.praetorium.gg/api/auth/oauth2/token',
    method: 'POST',
    body: 'grant_type=authorization_code',
  })
})
