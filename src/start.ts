import { createStart } from '@tanstack/react-start'
import { canonicalHostMiddleware } from 'ras-stack/tanstack/server'

/**
 * Sends every request for a hostname the deployment no longer calls itself to
 * the canonical one, keeping the path. Links outlive renames: the group link
 * someone pasted into a chat two months ago has to keep working, and it should
 * land them on the address the app now uses rather than leaving two live names
 * for the same thing.
 *
 * This lives in the app rather than in the proxy because Dokploy regenerates its
 * Traefik routers on every deploy, which would quietly drop a redirect written
 * there. Doing nothing is the default: with no `APP_URL` there is no canonical
 * host to compare against.
 */
const canonicalHost = canonicalHostMiddleware(() => ({
  canonicalUrl: process.env.APP_URL,
  pathsServedOnAnyHost: new Set(['/api/health']),
}))

export const startInstance = createStart(() => ({ requestMiddleware: [canonicalHost] }))
