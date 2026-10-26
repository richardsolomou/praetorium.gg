import type { BattleState, PlayerId, Refusal, RefusalCode } from './battle'

export function refuse(code: RefusalCode, message: string): Refusal {
  return { code, message }
}

export function sameSide(state: BattleState, left: PlayerId | null, right: PlayerId): boolean {
  const leftSide = state.players.find((player) => player.id === left)?.side
  return leftSide !== undefined && leftSide === state.players.find((player) => player.id === right)?.side
}

/** Every seat on a side, in seating order. */
export function sidePlayers<T extends { side: number }>(state: { players: readonly T[] }, side: number): T[] {
  return state.players.filter((player) => player.side === side)
}

/** The side across the table, or undefined while nobody sits there. */
export function opposingSide(state: { players: readonly { side: number }[] }, side: number): number | undefined {
  return state.players.find((player) => player.side !== side)?.side
}

export function playsSide(state: BattleState, viewerId: PlayerId | null, side: number): boolean {
  const players = sidePlayers(state, side)
  return players.some((player) => player.id === viewerId) || (players.length > 0 && players.every((player) => player.automated))
}
