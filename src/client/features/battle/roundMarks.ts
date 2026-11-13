import { z } from 'zod'
import type { BattleView } from '../../../core/battleView'
import { parseStored } from '../../storedValue'

/** How far through a battle every turn and its scoring is done: a whole round, or the battle itself. */
export type RoundMark = { round: number; finished: boolean }

const markSchema = z.object({ round: z.number().int(), finished: z.boolean() })

export const roundSummaryStorageKey = (battleToken: string) => `praetorium.round-summary.${battleToken}`

export const parseRoundMark = (value: string | null): RoundMark | null => parseStored(markSchema, value) ?? null

// An ending sorts just after its own round, so a battle reopened after ending early still counts its later rounds.
const progress = (mark: RoundMark) => mark.round + (mark.finished ? 0.5 : 0)

export const sameMark = (left: RoundMark, right: RoundMark) => left.round === right.round && left.finished === right.finished

export const isBefore = (left: RoundMark, right: RoundMark) => progress(left) < progress(right)

/**
 * The last round whose turns are all played and scored. A round's second turn is still being
 * scored while the next round's first player waits on `settlementRound`, so that round is not done yet.
 */
export function settledMark(view: Pick<BattleView, 'status' | 'round' | 'settlementRound'>): RoundMark | null {
  if (view.status === 'finished') return { round: view.round, finished: true }
  if (view.status !== 'playing') return null
  const previous = view.round - 1
  return { round: Math.max(0, view.settlementRound === previous ? previous - 1 : previous), finished: false }
}

/**
 * The summary to show once a device sees the battle reach `now`, given the furthest one it closed before.
 * A device seeing the battle for the first time shows nothing, and a round replayed after an undo is not shown again.
 */
export function dueSummary(seen: RoundMark | null, now: RoundMark): RoundMark | null {
  if (!seen || !isBefore(seen, now)) return null
  return now.finished || now.round > 0 ? now : null
}
