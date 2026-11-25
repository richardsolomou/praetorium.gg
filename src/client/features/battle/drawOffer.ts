import { sameMissionId } from '../../../core/legacyIds'
import type { WhenDrawn } from '../../../contracts/missions'

const CHARACTERISTICS = { wounds: 'a **Wounds** characteristic', 'starting-strength': 'a **Starting Strength**' } as const

/** `message` is summary Markdown, so the rules terms it names read bold as a summary's do. */
type DrawOffer = { message: string; status: 'returned' | 'discarded'; label: string; required: boolean }

/**
 * Why this card may go back, or null when it may not.
 *
 * Round and already-held conditions the battle can settle itself. A condition about
 * what is on the table it cannot, so the player judges that one from the card's summary —
 * the same reason objective control is never inferred anywhere else.
 */
export function redrawOffer(rule: WhenDrawn | undefined, round: number, held: readonly { key: string }[]): DrawOffer | null {
  if (!rule) return null
  if (rule.operation === 'replace')
    return {
      message: 'Discard this if the card’s condition holds.',
      status: 'discarded',
      label: 'Discard and draw another',
      required: false,
    }
  if (rule.roundMax !== null) {
    if (round > rule.roundMax) return null
    const required = rule.required !== false
    return {
      message:
        rule.roundMax === 1
          ? `You ${required ? 'must' : 'can'} put this back in battle round 1.`
          : `You ${required ? 'must' : 'can'} put this back in battle round ${rule.roundMax} or earlier.`,
      status: 'returned',
      label: 'Put back and draw another',
      required,
    }
  }
  if (rule.noEnemy) {
    const { entity, characteristic, min } = rule.noEnemy
    return {
      message: `You can put this back if no enemy ${entity} has ${CHARACTERISTICS[characteristic]} of ${min} or more.`,
      status: 'returned',
      label: 'Put back and draw another',
      required: false,
    }
  }
  return held.some((card) => rule.heldCards.some((paired) => sameMissionId(paired, card.key)))
    ? {
        message: 'You can put this back while its paired mission is active.',
        status: 'returned',
        label: 'Put back and draw another',
        required: false,
      }
    : null
}
