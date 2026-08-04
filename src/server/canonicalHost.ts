/**
 * Where a request should be sent instead, or null to serve it where it is.
 *
 * Compares hosts only: the scheme a request arrives with is the proxy's business,
 * and a mismatch there is not this app's to fix. Anything unparseable is served
 * rather than redirected, since guessing at a broken URL is worse than ignoring
 * it. Kept apart from the middleware so the rule can be tested without a server.
 */
/**
 * The container checks its own health over 127.0.0.1, which is never the
 * canonical host, so redirecting it would send the check out to the internet to
 * ask a different machine whether this one is alive.
 */
const SERVED_ON_ANY_HOST = new Set(['/api/health'])

export function canonicalRedirect(requestUrl: string, appUrl: string | undefined): string | null {
  if (!appUrl?.trim()) return null
  try {
    const canonical = new URL(appUrl)
    const incoming = new URL(requestUrl)
    if (incoming.host === canonical.host || SERVED_ON_ANY_HOST.has(incoming.pathname)) return null
    return new URL(incoming.pathname + incoming.search + incoming.hash, canonical.origin).toString()
  } catch {
    return null
  }
}
