import { createHash, randomBytes } from 'node:crypto'

/**
 * Public reference pages and the files crawlers read. None of these addresses names a player,
 * battle, league or saved list, so a request for one can be recorded without its owner.
 */
const PUBLIC_PATH =
  /^\/(?:|factions(?:\/.*)?|missions(?:\/.*)?|mission-packs(?:\/.*)?|mission-matchups\/.*|force-dispositions(?:\/.*)?|rules(?:\/.*)?|data-updates(?:\/.*)?|leaderboard|simulator|sources|rosters|sitemap\.xml|robots\.txt|llms\.txt|api\/reference\/v1(?:\/.*)?)$/

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
export function crawlerRequestEvent(request: Request, status: number, now = new Date()) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  if (!PUBLIC_PATH.test(url.pathname)) return null
  const userAgent = request.headers.get('user-agent') ?? ''
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
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
    },
  }
}

function referrerOrigin(referrer: string | null) {
  if (!referrer) return null
  try {
    return new URL(referrer).origin
  } catch {
    return null
  }
}
