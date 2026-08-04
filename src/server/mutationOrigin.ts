import { getRequest } from '@tanstack/react-start/server'

/**
 * The request must carry an Origin belonging to this deployment. `APP_URL` is
 * only needed when the reverse proxy cannot pass the public host through.
 */
export function requireMutationOrigin(request = getRequest()) {
  const origin = request.headers.get('origin')
  const site = request.headers.get('sec-fetch-site')
  if (!origin || (site && site !== 'same-origin')) throw rejected()
  if (![new URL(request.url).origin, forwardedOrigin(request), configuredOrigin()].includes(origin)) throw rejected()
}

function forwardedOrigin(request: Request) {
  const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host')?.trim()
  const protocol = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
  if (!host || (protocol !== 'http' && protocol !== 'https')) return undefined
  return parseOrigin(`${protocol}://${host}`)
}

function configuredOrigin() {
  const url = process.env.APP_URL?.trim()
  return url ? parseOrigin(url) : undefined
}

function parseOrigin(url: string) {
  try {
    return new URL(url).origin
  } catch {
    return undefined
  }
}

const rejected = () => new Response('cross-origin mutation rejected', { status: 403 })
