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
export function redrawOffer(rule: WhenDrawn | undefined, round: number, held: readonly { key: string }[]): string | null {
  if (!rule) return null
  if (rule.roundMax !== null) {
    if (round > rule.roundMax) return null
    return rule.roundMax === 1
      ? 'You may put this back in battle round 1.'
      : `You may put this back in battle round ${rule.roundMax} or earlier.`
  }
  if (rule.heldCards.length) {
    return held.some((card) => rule.heldCards.includes(card.key)) ? 'You may put this back while you hold the card it pairs with.' : null
  }
  return rule.condition ? `You may put this back if ${rule.condition}.` : null
}
