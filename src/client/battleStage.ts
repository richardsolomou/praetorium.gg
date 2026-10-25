/** Share stage labels and colors across battle lists, with setup amber, live green, and finished grey. */
type BattleStatus = 'setup' | 'playing' | 'finished'

type BattleStage = { name: string; tint: string }

const STAGES: Record<BattleStatus, BattleStage> = {
  setup: { name: 'Setting up', tint: 'text-discarded' },
  playing: { name: 'Live', tint: 'text-parchment' },
  finished: { name: 'Finished', tint: 'text-faint' },
}

export const battleStage = (status: BattleStatus): BattleStage => STAGES[status]

const OUTCOMES: Record<'won' | 'lost' | 'drawn', BattleStage> = {
  won: { name: 'Won', tint: 'text-achieved' },
  lost: { name: 'Lost', tint: 'text-rust' },
  drawn: { name: 'Drawn', tint: 'text-dim' },
}

/** How a finished battle went for one side, as standings count it. */
export const battleOutcomeStage = (outcome: keyof typeof OUTCOMES): BattleStage => OUTCOMES[outcome]

export const BATTLE_ENDINGS = { 'finished-early': 'Finished early', conceded: 'Conceded' } as const
