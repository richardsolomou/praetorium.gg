import type { BattleView, Phase } from '../core/battle'

export type AwardTrigger = {
  timing: string | null
  phase: string | null
  playerTurn: string | null
  roundMin: number | null
  roundMax: number | null
}

export type ScoringAward = { vp: number; per: string | null; mode: string | null; when: string | null; trigger: AwardTrigger }

export type DueCard = {
  key: string
  name: string
  category: 'primary' | 'secondary'
  awards: ScoringAward[]
}

/**
 * The moments an advance passes through, in the words the card data uses.
 *
 * Ending the last phase of a turn ends the turn as well, and the last turn of the
 * last round ends the battle, so one press can settle more than one kind of card.
 */
export function momentsPassed(view: Pick<BattleView, 'phase' | 'round' | 'rounds'>): string[] {
  if (view.phase !== 'end') return ['end-of-phase']
  return view.round >= view.rounds ? ['end-of-phase', 'end-of-turn', 'end-of-battle'] : ['end-of-phase', 'end-of-turn']
}

/**
 * Whether a payout is one the player should be asked about right now.
 *
 * A card that says nothing about its timing is never asked about on a schedule: the
 * source did not say when it pays, so inventing a moment for it would be a guess.
 */
export function dueNow(trigger: AwardTrigger, view: Pick<BattleView, 'phase' | 'round' | 'rounds'>, yourTurn: boolean): boolean {
  if (!trigger.timing || !momentsPassed(view).includes(trigger.timing)) return false
  if (trigger.timing === 'end-of-phase' && trigger.phase && trigger.phase !== view.phase) return false
  if (trigger.playerTurn === 'your-turn' && !yourTurn) return false
  if (trigger.playerTurn === 'opponent-turn' && yourTurn) return false
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return false
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return false
  return true
}

/** Every card with a payout due at this advance, and only the payouts that are due. */
export function cardsDue(
  view: Pick<BattleView, 'phase' | 'round' | 'rounds'>,
  yourTurn: boolean,
  cards: readonly { key: string; name: string; category: 'primary' | 'secondary'; awards: readonly ScoringAward[] }[],
): DueCard[] {
  return cards
    .map((card) => ({
      key: card.key,
      name: card.name,
      category: card.category,
      awards: card.awards.filter((award) => dueNow(award.trigger, view, yourTurn)),
    }))
    .filter((card) => card.awards.length > 0)
}

/** The phase the card data names, so a label can say which one is being settled. */
export const phaseLabel = (phase: Phase) => `${phase} phase`
