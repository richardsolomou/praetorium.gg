import { createHash, randomBytes } from 'node:crypto'

/**
 * Public reference pages and the files crawlers read. None of these addresses names a player,
 * battle, sealed event or saved list, so a request for one can be recorded without its owner.
 */
export const PUBLIC_PATH =
  /^\/(?:|factions(?:\/.*)?|missions(?:\/.*)?|mission-packs(?:\/.*)?|mission-matchups\/.*|force-dispositions(?:\/.*)?|rules(?:\/.*)?|data-updates(?:\/.*)?|leaderboard|simulator|sources|rosters|sitemap\.xml|robots\.txt|llms\.txt|api\/reference\/v1(?:\/.*)?)$/

/** A GET or HEAD for a public page. */
export function publicRead(request: Request) {
  return (request.method === 'GET' || request.method === 'HEAD') && PUBLIC_PATH.test(new URL(request.url).pathname)
}

/** The first address in `x-forwarded-for`, which the server in front sets to the visitor's. */
export function clientAddress(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
}

/** Never written down, so a visitor's id cannot be recomputed from their address and browser. */
const SALT = randomBytes(32)

/**
 * The `$http_log` event for a request a crawler might have made, or null for any request that is
 * not a public page read.
 *
 * Most crawlers and AI agents run no JavaScript, so the server's own request is the only record of
 * their visit. PostHog classifies the user agent at query time. The address and query string are
 * left out, and the referrer is cut to its origin, so the event carries nothing about the reader
 * beyond their browser. The id is a daily hash of address and browser under a salt that dies with
 * the process: it counts distinct clients within a day without following anyone across days.
 */
export function crawlerRequestEvent(request: Request, status: number, durationMs: number, now = new Date()) {
  if (!publicRead(request)) return null
  const url = new URL(request.url)
  const userAgent = request.headers.get('user-agent') ?? ''
  const address = clientAddress(request) ?? ''
  const referrer = referrerOrigin(request.headers.get('referer'))
  const day = now.toISOString().slice(0, 10)
  const distinctId = `http_log_${createHash('sha256').update(SALT).update(`${day}\0${address}\0${userAgent}`).digest('hex').slice(0, 32)}`
  return {
    distinctId,
    properties: {
      $process_person_profile: false,
      // Without an address PostHog would place every request at the server.
      $geoip_disable: true,
      $current_url: `${url.origin}${url.pathname}`,
      $host: url.host,
      $pathname: url.pathname,
      $raw_user_agent: userAgent,
      ...(referrer ? { $referrer: referrer } : {}),
      method: request.method,
      status_code: status,
      duration_ms: Math.round(durationMs),
    },
  }
}

function referrerOrigin(referrer: string | null) {
  return referrer ? (URL.parse(referrer)?.origin ?? null) : null
}
