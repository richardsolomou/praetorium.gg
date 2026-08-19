import { type BattleView, type Phase, TACTICAL_HAND_SIZE } from '../core/battle'

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
  /** The hand as it stood when that turn ended. A card dealt since was not in play for it. */
  hand: readonly string[],
): DueCard[] {
  return cards
    .filter((card) => card.category === 'primary' || hand.includes(card.key))
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

/** A tactical hand is two cards. */
export { TACTICAL_HAND_SIZE as HAND_SIZE }

/**
 * The next card to ask the deck for, or null when the hand is accounted for.
 *
 * `asked` is what has been requested and not yet come back. Counting it is the whole
 * point: a request is in flight for a moment before the hand it fills arrives, and
 * without it a hand of one gets dealt back up to three. A card already played is
 * never dealt again, whatever the deck still lists.
 */
export function nextDraw<T extends { key: string }>(
  held: readonly { key: string; status: string }[],
  asked: ReadonlySet<string>,
  deck: readonly T[],
): T | null {
  const active = held.filter((card) => card.status === 'active').length
  const outstanding = [...asked].filter((key) => !held.some((card) => card.key === key)).length
  if (active + outstanding >= TACTICAL_HAND_SIZE) return null
  return deck.find((card) => !asked.has(card.key) && !held.some((entry) => entry.key === card.key)) ?? null
}

/**
 * Whether scoring a card is what finishes it.
 *
 * A tactical card is played once: it comes off the deck, pays, and is done, which is
 * what leaves a gap for the next turn to fill. A fixed hand is chosen for the whole
 * battle and scores as often as the card allows, so nothing about it is finished by
 * being scored.
 */
export function finishesOnScore(category: 'primary' | 'secondary', mode: 'fixed' | 'tactical', scored: number) {
  return category === 'secondary' && mode === 'tactical' && scored > 0
}

/**
 * Which prompt a turn opens with.
 *
 * What the opponent's turn owed is settled before the hand this one deals: both are
 * modal, and a player asked about a card while a second prompt is being dealt over
 * the top of it cannot read either.
 */
export function turnPrompt(owed: number, drawing: boolean): 'owed' | 'draw' | null {
  if (owed > 0) return 'owed'
  return drawing ? 'draw' : null
}
