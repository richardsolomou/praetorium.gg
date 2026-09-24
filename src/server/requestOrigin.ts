import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { forwardedOrigin } from 'ras-stack/auth'

export { forwardedOrigin, parseOrigin } from 'ras-stack/auth'

/**
 * Where readers reach this instance, for anything that prints an absolute link.
 *
 * `APP_URL` when it is set, which is also where every other host redirects; then the
 * host and protocol the proxy forwarded; then the address the request arrived at.
 */
export function publicOrigin(request: Request) {
  return (process.env.APP_URL?.trim() || forwardedOrigin(request) || new URL(request.url).origin).replace(/\/$/, '')
}

/**
 * The same origin for a page's metadata, which is written on both sides of hydration.
 *
 * Only the server's answer is ever read by anything that needs it absolute: a crawler
 * reads the first response and never runs the page.
 */
export const siteOrigin = createIsomorphicFn()
  .server(() => publicOrigin(getRequest()))
  .client(() => window.location.origin)
