import { PUBLIC_PATH } from './crawlerRequests'

/**
 * Under the client's 30 second `SSR_STALE_TIME` with room for the page to load, so the data a cached page hydrates is
 * still fresh and its screens do not ask the origin again. Short, too, so a deploy's removed assets are soon unreferenced.
 */
export const SHARED_PAGE_CACHE = 'public, max-age=0, s-maxage=20'

const SIGNED_IN = /(?:^|;\s*)(?:__Secure-)?better-auth\./

/** A GET or HEAD for a public page. */
export function publicRead(request: Request) {
  return (request.method === 'GET' || request.method === 'HEAD') && PUBLIC_PATH.test(new URL(request.url).pathname)
}

/**
 * A public read with no sign of a session. Any `better-auth.` cookie counts, forged or not, because the cost of
 * mistaking a forged one for a session is only an uncached page, while the reverse would share a player's page.
 */
export function signedOutPublicRead(request: Request) {
  if (request.headers.has('authorization') || SIGNED_IN.test(request.headers.get('cookie') ?? '')) return false
  return publicRead(request)
}

/**
 * The `Cache-Control` that lets Cloudflare share a reference page between signed-out readers, or null.
 *
 * Only pages every signed-out reader receives byte for byte qualify. The roster library reads the guest's own
 * cookies while rendering, so it never does.
 */
export function sharedPageCache(request: Request, response: Response) {
  if (response.status !== 200 || response.headers.has('cache-control') || response.headers.has('set-cookie')) return null
  if (!response.headers.get('content-type')?.startsWith('text/html')) return null
  return signedOutPublicRead(request) && new URL(request.url).pathname !== '/rosters' ? SHARED_PAGE_CACHE : null
}
