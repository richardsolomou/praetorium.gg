/**
 * Side 0 is the player who opened the battle, and it stays on the left on every
 * device. At arm's length across a table the tint is what tells you whose number
 * you are reading before you have read the name.
 */
const SIDE_TINTS = [
  { text: 'text-side-a', edge: 'border-t-side-a', rail: 'bg-side-a', glow: 'ring-side-a/40' },
  { text: 'text-side-b', edge: 'border-t-side-b', rail: 'bg-side-b', glow: 'ring-side-b/40' },
] as const

export const tint = (index: number) => SIDE_TINTS[index] ?? SIDE_TINTS[0]

/** Every named block in the tracker wears the same label. */
export const HEADING = 'text-[0.6875rem] font-bold tracking-[0.1em] text-dim uppercase'

/** A mission or stratagem: a named card you can act on. */
export const CARD = 'rounded-sm border border-edge bg-sunken px-2.5 py-2'
export const CARD_NAME = 'text-sm leading-tight font-bold text-azure uppercase'
