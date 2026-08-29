/** What the rules say about putting a card back the moment it is drawn. */
export type WhenDrawn = {
  operation: 'redraw' | 'replace'
  roundMax: number | null
  heldCards: string[]
  condition: string | null
}

/**
 * Why this card may go back, or null when it may not.
 *
 * Round and already-held conditions the battle can settle itself. A condition about
 * what is on the table it cannot, so that one is stated for the player to judge —
 * the same reason objective control is never inferred anywhere else.
 */
export type DrawOffer = { message: string; status: 'returned' | 'discarded'; label: string; required: boolean }

export function redrawOffer(rule: WhenDrawn | undefined, round: number, held: readonly { key: string }[]): DrawOffer | null {
  if (!rule) return null
  if (rule.operation === 'replace') {
    return rule.condition
      ? { message: `Discard this if ${rule.condition}.`, status: 'discarded', label: 'Discard and draw another', required: false }
      : null
  }
  if (rule.roundMax !== null) {
    if (round > rule.roundMax) return null
    return {
      message:
        rule.roundMax === 1
          ? 'You must put this back in battle round 1.'
          : `You must put this back in battle round ${rule.roundMax} or earlier.`,
      status: 'returned',
      label: 'Put back and draw another',
      required: true,
    }
  }
  if (rule.heldCards.length) {
    return held.some((card) => rule.heldCards.includes(card.key))
      ? {
          message: 'You must put this back while you hold the card it pairs with.',
          status: 'returned',
          label: 'Put back and draw another',
          required: true,
        }
      : null
  }
  return rule.condition
    ? {
        message: `Put this back if ${rule.condition}.`,
        status: 'returned',
        label: 'Put back and draw another',
        required: false,
      }
    : null
}
