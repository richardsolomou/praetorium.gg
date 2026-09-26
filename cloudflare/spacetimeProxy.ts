type Environment = {
  SPACETIME_DATABASE: string
  SPACETIME_URL: string
  SPACETIME_ACCESS_CLIENT_ID: string
  SPACETIME_ACCESS_CLIENT_SECRET: string
}

export async function spacetimeSocket(request: Request, environment: Environment) {
  const incoming = new URL(request.url)
  const pathname = incoming.pathname.slice('/spacetime'.length)
  const exchange = pathname === '/v1/identity/websocket-token' && request.method === 'POST'
  const subscribe =
    pathname === `/v1/database/${environment.SPACETIME_DATABASE}/subscribe` &&
    request.method === 'GET' &&
    request.headers.get('upgrade')?.toLowerCase() === 'websocket' &&
    Boolean(incoming.searchParams.get('token'))
  if (!exchange && !subscribe) return new Response(null, { status: 404 })
  if (exchange && !request.headers.get('authorization')?.startsWith('Bearer ')) return new Response(null, { status: 401 })
  const upstream = new URL(environment.SPACETIME_URL)
  if (upstream.protocol !== 'https:' || upstream.pathname !== '/' || upstream.search || upstream.hash)
    return new Response(null, { status: 503 })
  upstream.pathname = pathname
  upstream.search = incoming.search
  const headers = new Headers(request.headers)
  headers.delete('cookie')
  headers.set('CF-Access-Client-Id', environment.SPACETIME_ACCESS_CLIENT_ID)
  headers.set('CF-Access-Client-Secret', environment.SPACETIME_ACCESS_CLIENT_SECRET)
  const body = exchange ? await request.arrayBuffer() : undefined
  if (body && body.byteLength > 4_096) return new Response(null, { status: 413 })
  const response = await fetch(new Request(upstream, { method: request.method, headers, body }))
  if (exchange && response.ok)
    return new Response(response.body, { status: response.status, headers: { 'content-type': 'application/json' } })
  return response
}
