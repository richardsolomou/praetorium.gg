import { getRequest } from '@tanstack/react-start/server'
import { forwardedOrigin, parseOrigin } from './requestOrigin'

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

function configuredOrigin() {
  const url = process.env.APP_URL?.trim()
  return url ? parseOrigin(url) : undefined
}

const rejected = () => new Response('cross-origin mutation rejected', { status: 403 })
