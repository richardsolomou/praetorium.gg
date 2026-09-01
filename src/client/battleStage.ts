/**
 * What stage a battle is at, named and tinted once.
 *
 * Every list of battles answers the same question at a glance — is this one worth
 * opening now, or is it a game to read back through — so the word and the colour
 * are decided here rather than by each shelf, hero and profile row separately.
 *
 * The colours run in the order the stages do: amber for a table still being set,
 * the primary green for the one being played on, and receded grey for a battle
 * that is over. A reader scanning a page picks the live games out without reading
 * a word of it.
 */
export type BattleStatus = 'setup' | 'playing' | 'finished'

export type BattleStage = { name: string; tint: string }

const STAGES: Record<BattleStatus, BattleStage> = {
  setup: { name: 'Setting up', tint: 'text-discarded' },
  playing: { name: 'Live', tint: 'text-parchment' },
  finished: { name: 'Finished', tint: 'text-faint' },
}

export const battleStage = (status: BattleStatus): BattleStage => STAGES[status]
