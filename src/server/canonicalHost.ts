import { canonicalRedirect as sharedCanonicalRedirect } from 'ras-stack/server'

/**
 * The container checks its own health over 127.0.0.1, which is never the
 * canonical host, so redirecting it would send the check out to the internet to
 * ask a different machine whether this one is alive.
 */
const SERVED_ON_ANY_HOST = new Set(['/api/health'])

export function canonicalRedirect(requestUrl: string, appUrl: string | undefined): string | null {
  return sharedCanonicalRedirect(requestUrl, { canonicalUrl: appUrl, pathsServedOnAnyHost: SERVED_ON_ANY_HOST })
}
