import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { publicOrigin } from './origins'

/**
 * Where readers reach this instance, for a page's metadata, which is written on both sides of hydration.
 *
 * Only the server's answer is ever read by anything that needs it absolute: a crawler
 * reads the first response and never runs the page.
 */
export const siteOrigin = createIsomorphicFn()
  .server(() => publicOrigin(getRequest()))
  .client(() => window.location.origin)
