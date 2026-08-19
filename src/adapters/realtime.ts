import { signRealtimeToken } from 'ras-stack/realtime'

/**
 * Centrifugo, which is what "live" means here.
 *
 * The app never holds a socket open itself: it publishes "this battle changed"
 * over Centrifugo's HTTP API, and the page refetches through the normal read
 * path. A notification is only a nudge, never a payload, and the fan-out can
 * outlive one process.
 */
const TOKEN_TTL_SECONDS = 5 * 60

export function battleChannel(battleId: string) {
  return `battle:${battleId}`
}

/**
 * One channel per player, for the list of battles rather than any one battle.
 *
 * A player is told their battles changed before they have any of them open, which is
 * the only way being added to one can reach a page that is not watching it.
 */
export function playerChannel(playerId: string) {
  return `player:${playerId}`
}

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
  return signRealtimeToken(playerId, {}, { secret, now, ttlSeconds: TOKEN_TTL_SECONDS })
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
  return signRealtimeToken(
    player.id,
    { channel, info: { playerId: player.id, name: player.name } },
    { secret, now, ttlSeconds: TOKEN_TTL_SECONDS },
  )
}
