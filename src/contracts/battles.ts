export type BattlesCursor = { at: number; id: string }

export const REPLAY_BATCH_SIZE = 20

/** The made-up finished battle anyone may look through; the battle reads answer it without storing it. */
export const SAMPLE_BATTLE_TOKEN = 'sample'
