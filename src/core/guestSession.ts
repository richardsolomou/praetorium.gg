import type { BattleState } from './battle'

/** How long a device that joined a guest seat may act for it, before the host has to share a new link. */
export const GUEST_SESSION_MS = 30 * 24 * 60 * 60 * 1000

export function guestSessionCurrent(joinedAt: number, now: number) {
  return joinedAt <= now && now - joinedAt < GUEST_SESSION_MS
}

/**
 * Why a signed-in player may not take over the guest seat they played, or null.
 *
 * Only a finished battle moves, so no device can be mid-turn under the guest's seat while it is renamed.
 */
export function guestClaimRefusal(state: Pick<BattleState, 'status'>, seatIds: readonly string[], claimantId: string) {
  if (seatIds.includes(claimantId)) return 'you already have a seat in this battle'
  if (state.status !== 'finished') return 'finish the battle before adding it to your record'
  return null
}

/** Replaces every value that is exactly the seat id, so the log names the claimant wherever it named the guest. */
export function renameSeat<T>(value: T, from: string, to: string): T {
  if (value === from) return to as T
  if (Array.isArray(value)) return value.map((item: unknown) => renameSeat(item, from, to)) as T
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameSeat(item, from, to)])) as T
  return value
}
