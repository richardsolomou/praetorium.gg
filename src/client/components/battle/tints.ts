/**
 * Side 0 is the player who opened the battle, and it stays on the left on every
 * device. At arm's length across a table the tint is what tells you whose number
 * you are reading before you have read the name.
 */
const SIDE_TINTS = [
  {
    text: 'text-side-a',
    edge: 'border-t-side-a',
    rail: 'bg-side-a',
    glow: 'ring-side-a/40',
    /** A control that acts for this side, so pressing it already says whose it is. */
    fill: 'bg-side-a text-void hover:bg-side-a/80',
    /** The edge of a dialog that belongs to this side, read before its title is. */
    border: 'border-side-a/70',
    /** A choice recorded for this side, and the hint that pressing one will be. */
    mark: 'border-side-a bg-side-a/15 text-side-a',
    hint: 'hover:border-side-a hover:text-side-a',
  },
  {
    text: 'text-side-b',
    edge: 'border-t-side-b',
    rail: 'bg-side-b',
    glow: 'ring-side-b/40',
    fill: 'bg-side-b text-void hover:bg-side-b/80',
    border: 'border-side-b/70',
    mark: 'border-side-b bg-side-b/15 text-side-b',
    hint: 'hover:border-side-b hover:text-side-b',
  },
] as const

export const tint = (index: number) => SIDE_TINTS[index] ?? SIDE_TINTS[0]

/** Every named block in the tracker wears the same label. */
export const HEADING = 'text-[0.6875rem] font-bold tracking-[0.1em] text-dim uppercase'

/** A mission or stratagem: a named card you can act on. */
export const CARD = 'rounded-sm border border-edge bg-sunken px-2.5 py-2'
export const CARD_NAME = 'text-sm leading-tight font-bold text-azure uppercase'
