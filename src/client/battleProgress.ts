import type { BattleView } from '../core/battleView'

type ProgressView = Pick<BattleView, 'status' | 'round' | 'result' | 'firstPlayerId' | 'activePlayerId'>

export function completedSideRound(view: ProgressView, playerIds: readonly string[]) {
  if (view.status === 'finished' && view.result?.reason === 'completed') return view.round

  const priorRound = Math.max(0, view.round - 1)
  if (view.status !== 'playing' || !view.firstPlayerId || !view.activePlayerId) return priorRound

  const wentFirst = playerIds.includes(view.firstPlayerId)
  const takingTurn = playerIds.includes(view.activePlayerId)
  return wentFirst && !takingTurn ? view.round : priorRound
}
