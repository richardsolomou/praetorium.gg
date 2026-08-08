import crypto from 'node:crypto'

/**
 * Centrifugo, which is what "live" means here.
 *
 * The app never holds a socket open itself: it publishes "this battle changed"
 * over Centrifugo's HTTP API, and the page refetches through the normal read
 * path. That is the same discipline the old in-process stream had — a nudge and
 * never a payload — with the fan-out somewhere it can outlive one process.
 */
const TOKEN_TTL_SECONDS = 5 * 60

export const battleChannel = (battleId: string) => `battle:${battleId}`

export function realtimeConfig(environment: NodeJS.ProcessEnv = process.env) {
  const secret = environment.REALTIME_SECRET?.trim()
  return {
    /**
     * Where the browser connects. Same origin in production, because Caddy sits in
     * front of both the app and Centrifugo; in development Centrifugo is its own
     * container and the browser goes straight to it.
     */
    url: environment.REALTIME_URL?.trim() || '/connection/websocket',
    apiUrl: (environment.REALTIME_API_URL?.trim() || 'http://127.0.0.1:8000/api').replace(/\/$/, ''),
    apiKey: environment.REALTIME_API_KEY?.trim() || secret,
    secret,
  }
}

/** Proves who the connection is. It grants no channels by itself. */
export function connectionToken(playerId: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  return sign({ sub: playerId, exp: now + TOKEN_TTL_SECONDS }, secret)
}

/**
 * Proves this player may watch this battle.
 *
 * Issued per channel and only after the seat has been checked, so a leaked link
 * buys no stream — the same rule the old route enforced before opening one.
 * `info` is what the other player's screen shows as presence.
 */
export function subscriptionToken(
  player: { id: string; name: string },
  channel: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  return sign({ sub: player.id, channel, exp: now + TOKEN_TTL_SECONDS, info: { playerId: player.id, name: player.name } }, secret)
}

function sign(payload: Record<string, unknown>, secret: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const claims = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const unsigned = `${header}.${claims}`
  return `${unsigned}.${crypto.createHmac('sha256', secret).update(unsigned).digest('base64url')}`
}
