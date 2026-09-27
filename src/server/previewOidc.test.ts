import { expect, it } from 'vitest'
import { previewOidcRequest } from '../../cloudflare/previewOidc'

const issuer = `https://pr-606.praetorium.gg/api/auth/preview/${'c'.repeat(40)}`

it('routes only the revisioned public OIDC endpoints to Better Auth', () => {
  for (const path of ['/.well-known/openid-configuration', '/jwks']) {
    const request = new Request(`${issuer}${path}`)
    expect(previewOidcRequest(request, issuer).url).toBe(`https://pr-606.praetorium.gg/api/auth${path}`)
  }
})

it('leaves other hosts, paths, and methods unchanged', () => {
  for (const request of [
    new Request('https://other.example/api/auth/preview/' + 'c'.repeat(40) + '/jwks'),
    new Request(`${issuer}/token`),
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
