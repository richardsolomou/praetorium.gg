import { PUBLIC_PATH } from './crawlerRequests'

/**
 * Under the client's 30 second `SSR_STALE_TIME` with room for the page to load, so the data a cached page hydrates is
 * still fresh and its screens do not ask the origin again. Short, too, so a deploy's removed assets are soon unreferenced.
 */
export const SHARED_PAGE_CACHE = 'public, max-age=0, s-maxage=20'

const SIGNED_IN = /(?:^|;\s*)(?:__Secure-)?better-auth\./

/**
 * The `Cache-Control` that lets Cloudflare share a reference page between signed-out readers, or null.
 *
 * Only pages every signed-out reader receives byte for byte qualify. The roster library reads the guest's own
 * cookies while rendering, so it never does.
 */
export function sharedPageCache(request: Request, response: Response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  if (response.status !== 200 || response.headers.has('cache-control') || response.headers.has('set-cookie')) return null
  if (!response.headers.get('content-type')?.startsWith('text/html')) return null
  if (request.headers.has('authorization') || SIGNED_IN.test(request.headers.get('cookie') ?? '')) return null
  const { pathname } = new URL(request.url)
  return pathname !== '/rosters' && PUBLIC_PATH.test(pathname) ? SHARED_PAGE_CACHE : null
}
