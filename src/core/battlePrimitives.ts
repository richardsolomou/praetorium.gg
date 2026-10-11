import type { BattleState, PlayerId, Refusal, RefusalCode } from './battle'

export function refuse(code: RefusalCode, message: string): Refusal {
  return { code, message }
}

export function sameSide(state: BattleState, left: PlayerId | null, right: PlayerId): boolean {
  const leftSide = state.players.find((player) => player.id === left)?.side
  return leftSide !== undefined && leftSide === state.players.find((player) => player.id === right)?.side
}

export function playsSide(state: BattleState, viewerId: PlayerId | null, side: number): boolean {
  const players = state.players.filter((player) => player.side === side)
  return players.some((player) => player.id === viewerId) || (players.length > 0 && players.every((player) => player.automated))
}
