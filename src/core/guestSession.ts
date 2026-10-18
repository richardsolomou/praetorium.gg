import type { BattleState } from './battle'

/** How long a device that joined a guest seat may act for it, before the host has to share a new link. */
export const GUEST_SESSION_MS = 30 * 24 * 60 * 60 * 1000

export function guestSessionCurrent(joinedAt: number, now: number) {
  return joinedAt <= now && now - joinedAt < GUEST_SESSION_MS
}

/**
 * Why a signed-in player may not take over the guest seat they played, or null.
 *
 * Only a finished battle moves, so no device can be mid-turn as the guest's seat when the account takes it over.
 */
export function guestClaimRefusal(state: Pick<BattleState, 'status'>, seatIds: readonly string[], claimantId: string) {
  if (seatIds.includes(claimantId)) return 'you already have a seat in this battle'
  if (state.status !== 'finished') return 'finish the battle before adding it to your record'
  return null
}

/** The realtime session subject of the device holding a guest seat, so a token outlives neither the device's hold nor its session. */
export function guestDeviceSubject(deviceHash: string) {
  return `guest-device:${deviceHash}`
}

/**
 * The log as every reader sees it: a claimed guest seat is the account that claimed it, as sender and wherever a
 * command names the seat. The stored commands keep the seat they were written with.
 */
export function claimedLog<T extends { by: string; command: unknown }>(
  log: readonly T[],
  claims: readonly { seatId: string; userId: string }[],
): T[] {
  if (!claims.length) return [...log]
  const accounts = new Map(claims.map(({ seatId, userId }) => [seatId, userId]))
  return log.map((entry) => ({ ...entry, by: accounts.get(entry.by) ?? entry.by, command: renameSeats(entry.command, accounts) }))
}

/** Replaces every value that is exactly a claimed seat, so free text that mentions one keeps its words. */
function renameSeats<T>(value: T, accounts: ReadonlyMap<string, string>): T {
  if (typeof value === 'string') return (accounts.get(value) ?? value) as T
  if (Array.isArray(value)) return value.map((item: unknown) => renameSeats(item, accounts)) as T
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renameSeats(item, accounts)])) as T
  return value
}
