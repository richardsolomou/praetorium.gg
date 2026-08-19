import type { BattleView, Phase } from '../core/battle'

import type { MissionAward } from './missionText'

export type AwardTrigger = MissionAward['trigger']

export type DueCard = {
  key: string
  name: string
  category: 'primary' | 'secondary'
  awards: MissionAward[]
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

/**
 * What the turn that has just ended owes a side that was not taking it.
 *
 * A card that pays on the opponent's turn comes due while the other player holds
 * the controls, so it can never be settled by the advance that ends your own. The
 * round is the one the ended turn was in, which is not always the current one: the
 * second player passing the turn starts the next round.
 */
export function cardsDueFromTheirTurn(
  round: number,
  cards: readonly { key: string; name: string; category: 'primary' | 'secondary'; awards: readonly MissionAward[] }[],
): DueCard[] {
  return cards
    .map((card) => ({
      key: card.key,
      name: card.name,
      category: card.category,
      awards: card.awards.filter((award) => {
        const trigger = award.trigger
        if (trigger.timing !== 'end-of-turn') return false
        if (trigger.playerTurn !== 'opponent-turn' && trigger.playerTurn !== 'either') return false
        if (trigger.roundMin !== null && round < trigger.roundMin) return false
        if (trigger.roundMax !== null && round > trigger.roundMax) return false
        return true
      }),
    }))
    .filter((card) => card.awards.length > 0)
}

/** Every card with a payout due at this advance, and only the payouts that are due. */
export function cardsDue(
  view: Pick<BattleView, 'phase' | 'round' | 'rounds'>,
  yourTurn: boolean,
  cards: readonly { key: string; name: string; category: 'primary' | 'secondary'; awards: readonly MissionAward[] }[],
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
