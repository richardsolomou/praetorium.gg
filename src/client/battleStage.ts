/** Share stage labels and colors across battle lists, with setup amber, live green, and finished grey. */
export type BattleStatus = 'setup' | 'playing' | 'finished'

export type BattleStage = { name: string; tint: string }

const STAGES: Record<BattleStatus, BattleStage> = {
  setup: { name: 'Setting up', tint: 'text-discarded' },
  playing: { name: 'Live', tint: 'text-parchment' },
  finished: { name: 'Finished', tint: 'text-faint' },
}

export const battleStage = (status: BattleStatus): BattleStage => STAGES[status]
