import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { publicOrigin as sharedPublicOrigin } from 'ras-stack/auth'

/** Where readers reach this instance, for absolute links. `APP_URL` wins because every other host redirects there. */
export function publicOrigin(request: Request) {
  return sharedPublicOrigin(request, { configured: [process.env.APP_URL], trustForwardedHeaders: true })
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
