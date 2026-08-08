import { SignJWT } from 'jose'

/**
 * Centrifugo, which is what "live" means here.
 *
 * The app never holds a socket open itself: it publishes "this battle changed"
 * over Centrifugo's HTTP API, and the page refetches through the normal read
 * path. A notification is only a nudge, never a payload, and the fan-out can
 * outlive one process.
 */
const TOKEN_TTL_SECONDS = 5 * 60

export const battleChannel = (battleId: string) => `battle:${battleId}`

export function realtimeConfig(environment: NodeJS.ProcessEnv = process.env) {
  // The container writes one into /data on first boot. The fallback is for `pnpm
  // dev`, where `pnpm realtime` runs Centrifugo with the same well-known string;
  // production never reaches it, because the entrypoint always sets one.
  const secret =
    environment.REALTIME_SECRET?.trim() || (environment.NODE_ENV === 'production' ? undefined : 'praetorium-development-realtime-secret')
  return {
    apiUrl: (environment.REALTIME_API_URL?.trim() || 'http://127.0.0.1:8000/api').replace(/\/$/, ''),
    apiKey: environment.REALTIME_API_KEY?.trim() || secret,
    secret,
  }
}

/** Proves who the connection is. It grants no channels by itself. */
export async function connectionToken(playerId: string, secret: string, now = Math.floor(Date.now() / 1000)) {
  return sign({ sub: playerId, exp: now + TOKEN_TTL_SECONDS }, secret)
}

/**
 * Proves this player may watch this battle.
 *
 * Issued per channel and only after the seat has been checked, so a leaked link
 * buys no stream.
 * `info` is what the other player's screen shows as presence.
 */
export async function subscriptionToken(
  player: { id: string; name: string },
  channel: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
) {
  return sign({ sub: player.id, channel, exp: now + TOKEN_TTL_SECONDS, info: { playerId: player.id, name: player.name } }, secret)
}

const sign = (payload: Record<string, unknown>, secret: string) =>
  new SignJWT(payload).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(new TextEncoder().encode(secret))
