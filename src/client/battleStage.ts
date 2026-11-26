import type { BattleEndReason, BattleStatus } from '../core/battle'
import { battleOutcome, type BattleOutcome, playerOutcome, type StandingBattle } from '../core/standings'

/** Share stage labels and colors across battle lists, with setup amber, live green, and finished grey. */
type BattleStage = { name: string; tint: string }

const STAGES: Record<BattleStatus, BattleStage> = {
  setup: { name: 'Setting up', tint: 'text-discarded' },
  playing: { name: 'Live', tint: 'text-parchment' },
  finished: { name: 'Finished', tint: 'text-faint' },
}

export const battleStage = (status: BattleStatus): BattleStage => STAGES[status]

const OUTCOMES: Record<BattleOutcome, BattleStage> = {
  won: { name: 'Won', tint: 'text-achieved' },
  lost: { name: 'Lost', tint: 'text-rust' },
  drawn: { name: 'Drawn', tint: 'text-dim' },
}

/** How a finished battle went for one side, as standings count it. */
export const battleOutcomeStage = (outcome: keyof typeof OUTCOMES): BattleStage => OUTCOMES[outcome]

/** A battle's stage as one viewer reads it: their own result once it is finished, otherwise its stage. */
export function viewerStage(battle: StandingBattle, viewerId: string | null | undefined): BattleStage {
  const outcome = battle.status === 'finished' ? playerOutcome(battle, viewerId) : null
  return outcome ? battleOutcomeStage(outcome) : battleStage(battle.status)
}

/** Whether a side lost a finished battle, which lists fade so the winners stand out; a draw fades neither. */
export const sideLost = (battle: StandingBattle, side: number) => battle.status === 'finished' && battleOutcome(battle, side) === 'lost'

/** Whether a side won a finished battle, which lists mark by name since a concession can hand it to the lower score. */
export const sideWon = (battle: StandingBattle, side: number) => battle.status === 'finished' && battleOutcome(battle, side) === 'won'

/** How a game ended, as a battle card notes it; a concession goes unsaid there, since the result already names the winner. */
const BATTLE_ENDINGS: Partial<Record<BattleEndReason, string>> = { 'finished-early': 'Finished early', reported: 'Score reported' }

export const battleEnding = (reason?: BattleEndReason | null) => (reason ? BATTLE_ENDINGS[reason] : undefined)
