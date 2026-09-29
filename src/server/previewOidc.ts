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
  if (suffix !== '/jwks' && !suffix.startsWith('/oauth2/')) return request
  incoming.pathname = `/api/auth${suffix}`
  return new Request(incoming, { method: request.method, headers: request.headers })
}

export async function previewOAuthPostRequest(request: Request, issuer?: string, externalOrigin?: string) {
  if (!issuer || request.method !== 'POST') return request
  const configured = new URL(issuer)
  const incoming = new URL(request.url)
  if (
    configured.protocol !== 'https:' ||
    configured.origin !== (externalOrigin ? new URL(externalOrigin).origin : incoming.origin) ||
    !/^\/api\/auth\/preview\/[0-9a-f]{40}$/.test(configured.pathname) ||
    !incoming.pathname.startsWith(`${configured.pathname}/oauth2/`)
  )
    return request
  incoming.pathname = `/api/auth${incoming.pathname.slice(configured.pathname.length)}`
  return new Request(incoming, { method: 'POST', headers: request.headers, body: await request.arrayBuffer() })
}
