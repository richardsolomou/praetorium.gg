export function previewOidcRequest(request: Request, issuer?: string, externalOrigin?: string) {
  if (!issuer || request.method !== 'GET') return request
  const configured = new URL(issuer)
  const incoming = new URL(request.url)
  if (
    configured.protocol !== 'https:' ||
    configured.origin !== (externalOrigin ? new URL(externalOrigin).origin : incoming.origin) ||
    !/^\/api\/auth\/preview\/[0-9a-f]{40}$/.test(configured.pathname) ||
    configured.username ||
    configured.password ||
    configured.search ||
    configured.hash ||
    !incoming.pathname.startsWith(configured.pathname)
  ) {
    return request
  }
  const suffix = incoming.pathname.slice(configured.pathname.length)
  if (!['/jwks', '/.well-known/openid-configuration'].includes(suffix)) return request
  incoming.pathname = `/api/auth${suffix}`
  return new Request(incoming, { method: request.method, headers: request.headers })
}
