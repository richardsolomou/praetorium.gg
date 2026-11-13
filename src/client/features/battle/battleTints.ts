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
    /** The colour a line-form rail draws in for this side. */
    line: '[--line-colour:var(--color-side-a)]',
    glow: 'ring-side-a/40',
    /** A control that acts for this side, so pressing it already says whose it is. */
    fill: 'bg-side-a-fill text-side-a-ink hover:bg-side-a-fill/80',
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
    line: '[--line-colour:var(--color-side-b)]',
    glow: 'ring-side-b/40',
    fill: 'bg-side-b-fill text-side-b-ink hover:bg-side-b-fill/80',
    border: 'border-side-b/70',
    mark: 'border-side-b bg-side-b/15 text-side-b',
    hint: 'hover:border-side-b hover:text-side-b',
  },
] as const

export const tint = (index: number) => SIDE_TINTS[index] ?? SIDE_TINTS[0]

/** A mission or stratagem: a named card you can act on, as a part. */
export const CARD = 'part px-2.5 py-2'
/** A card's name, in the condensed face so long names fit a narrow column; underlined dotted where pressing it opens the card. */
export const CARD_NAME = 'text-sm leading-tight font-bold text-bone uppercase'
export const CARD_NAME_LINK = 'underline decoration-runner-hi decoration-dotted decoration-2 underline-offset-4 hover:decoration-parchment'
