import type { BattleEndReason } from '../core/battle'
import { sideName } from './sides'

type OutcomeSide = { index: number; armies: readonly { playerName: string }[]; total: number }
type OutcomeView = {
  players: readonly { id: string; side: number }[]
  result: { reason: BattleEndReason; concededBy: string | null } | null
}

/**
 * How the battle ended, in the parts a screen draws it from.
 *
 * A side that won is the piece every surface wants for itself — the name to colour,
 * the avatar to show, the device to congratulate — so it is answered once here rather
 * than parsed back out of the sentence.
 */
export type BattleResult =
  | { kind: 'win'; side: OutcomeSide; verb: 'wins' | 'win'; detail: string; score: string | null }
  | { kind: 'none'; detail: string }

export function battleResult(table: readonly OutcomeSide[], view: OutcomeView): BattleResult {
  const won = (side: OutcomeSide, detail: string, score: string | null = null): BattleResult => ({
    kind: 'win',
    side,
    verb: side.armies.length === 1 ? 'wins' : 'win',
    detail,
    score,
  })
  if (view.result?.reason === 'conceded') {
    const conceded = view.players.find((player) => player.id === view.result?.concededBy)?.side
    if (conceded === undefined) return { kind: 'none', detail: 'Battle conceded' }
    const winningSide = table.find((side) => side.index !== conceded)
    return winningSide ? won(winningSide, 'by concession') : { kind: 'none', detail: 'Battle conceded' }
  }
  const [first, second] = table.toSorted((left, right) => right.total - left.total)
  if (!first) return { kind: 'none', detail: 'No result' }
  if (!second) return { kind: 'none', detail: `Final score ${first.total}` }
  if (first.total === second.total) return { kind: 'none', detail: `Drawn at ${first.total}` }
  const score = `${first.total}–${second.total}`
  return won(first, score, score)
}

/** The same result as one sentence, for the places that have room for a line and no more. */
export function battleOutcome(table: readonly OutcomeSide[], view: OutcomeView) {
  const result = battleResult(table, view)
  return result.kind === 'win' ? `${sideName(result.side)} ${result.verb} ${result.detail}` : result.detail
}
