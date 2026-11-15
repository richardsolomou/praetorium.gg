import { z } from 'zod'
import type { BattleState, PlayerId } from './battle'

/** What the fold says about the battle's place in the turn, from either the fold itself or a view of it. */
export type ScoringMomentSource = Pick<BattleState, 'status' | 'activePlayerId' | 'phase' | 'scoringAcknowledged' | 'momentSeq'> & {
  pendingSettlement: { playerId: PlayerId } | null
}

/**
 * The scoring prompt a half-answered draft belongs to, or null when none can be open.
 *
 * A draft stands only while the battle stays at this moment: scoring landing, the turn moving on, or an undo back past
 * it each change the key, and every draft written for the old key is dropped. `momentSeq` keeps a phase played again
 * after an undo from reading as the one undone.
 */
export function scoringMoment(source: ScoringMomentSource): string | null {
  if (source.status !== 'playing') return null
  if (source.pendingSettlement) return JSON.stringify(['owed', source.momentSeq, source.pendingSettlement.playerId])
  if (source.scoringAcknowledged) return null
  return JSON.stringify(['turn', source.momentSeq, source.activePlayerId, source.phase])
}

const MAX_DRAFT_CARDS = 16
const MAX_DRAFT_AWARDS = 16

/** How many times each payout on each card was pressed, keyed by card. */
export const scoringDraftAnswersSchema = z
  .record(z.string().min(1).max(128), z.array(z.number().int().min(0).max(100)).max(MAX_DRAFT_AWARDS))
  .refine((answers) => Object.keys(answers).length <= MAX_DRAFT_CARDS, 'too many cards')

/** One player's unconfirmed answers to the scoring prompt open for `playerId`'s side at `moment`. */
export const scoringDraftSchema = z.strictObject({
  moment: z.string().min(1).max(256),
  playerId: z.string().min(1).max(128),
  answers: scoringDraftAnswersSchema,
})
export type ScoringDraft = z.infer<typeof scoringDraftSchema>
