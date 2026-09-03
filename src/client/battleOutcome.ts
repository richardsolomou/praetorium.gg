import type { BattleEndReason } from '../core/battle'
import { sideName } from './sides'

type OutcomeSide = { index: number; armies: readonly { playerName: string }[]; total: number }
type OutcomeView = {
  players: readonly { id: string; side: number }[]
  result: { reason: BattleEndReason; concededBy: string | null } | null
}

function winner(side: OutcomeSide) {
  return `${sideName(side)} ${side.armies.length === 1 ? 'wins' : 'win'}`
}

export function battleOutcome(table: OutcomeSide[], view: OutcomeView) {
  if (view.result?.reason === 'conceded') {
    const conceded = view.players.find((player) => player.id === view.result?.concededBy)?.side
    if (conceded === undefined) return 'Battle conceded'
    const winningSide = table.find((side) => side.index !== conceded)
    return winningSide ? `${winner(winningSide)} by concession` : 'Battle conceded'
  }
  const [first, second] = table.toSorted((left, right) => right.total - left.total)
  if (!first) return 'No result'
  if (!second) return `Final score ${first.total}`
  return first.total === second.total ? `Drawn at ${first.total}` : `${winner(first)} ${first.total}–${second.total}`
}
