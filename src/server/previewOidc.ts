import { boundedBody } from './boundedBody'

/** A preview deployment's issuer: this site's own HTTPS origin, under the path a preview is served from, and nothing else. */
export function isPreviewIssuer(issuer: URL, origin: string) {
  return (
    issuer.protocol === 'https:' &&
    issuer.origin === origin &&
    /^\/api\/auth\/preview\/[0-9a-f]{40}$/.test(issuer.pathname) &&
    !issuer.username &&
    !issuer.password &&
    !issuer.search &&
    !issuer.hash
  )
}

export function previewOidcRequest(request: Request, issuer?: string, externalOrigin?: string) {
  if (!issuer || request.method !== 'GET') return request
  const configured = new URL(issuer)
  const incoming = new URL(request.url)
  if (
    !isPreviewIssuer(configured, externalOrigin ? new URL(externalOrigin).origin : incoming.origin) ||
    !incoming.pathname.startsWith(configured.pathname)
  ) {
    return request
  }
  const suffix = incoming.pathname.slice(configured.pathname.length)
  if (suffix !== '/jwks' && !suffix.startsWith('/oauth2/')) return request
  incoming.pathname = `/api/auth${suffix}`
  return new Request(incoming, { method: request.method, headers: request.headers })
}

/** Better Auth parses POST bodies before running endpoint middleware. */
export async function authPostRequest(request: Request, issuer?: string, externalOrigin?: string) {
  const incoming = new URL(request.url)
  if (issuer) {
    const configured = new URL(issuer)
    if (
      isPreviewIssuer(configured, externalOrigin ? new URL(externalOrigin).origin : incoming.origin) &&
      incoming.pathname.startsWith(`${configured.pathname}/oauth2/`)
    ) {
      incoming.pathname = `/api/auth${incoming.pathname.slice(configured.pathname.length)}`
    }
  }
  const limit = incoming.pathname.startsWith('/api/auth/native-auth-token/') ? 8 * 1024 : 1024 * 1024
  const body = await boundedBody(request, limit)
  return body && new Request(incoming, { method: 'POST', headers: request.headers, body, signal: request.signal })
}
