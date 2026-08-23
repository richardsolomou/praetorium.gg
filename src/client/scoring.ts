import { TACTICAL_HAND_SIZE } from '../core/battle'
import { type BattleView } from '../core/battleView'

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
      awards: card.awards.filter((award) =>
        card.category === 'primary' && view.round >= view.rounds
          ? finalRoundPrimaryDue(award.trigger, view, yourTurn)
          : dueNow(award.trigger, view, yourTurn),
      ),
    }))
    .filter((card) => card.awards.length > 0)
}

/** Primary missions move from their printed phase to the end of your turn in the final round. */
function finalRoundPrimaryDue(trigger: AwardTrigger, view: Pick<BattleView, 'phase' | 'round' | 'rounds'>, yourTurn: boolean) {
  if (!trigger.timing || view.phase !== 'end' || !yourTurn) return false
  if (trigger.roundMin !== null && view.round < trigger.roundMin) return false
  if (trigger.roundMax !== null && view.round > trigger.roundMax) return false
  return true
}

/** The phase the card data names, so a label can say which one is being settled. */
/** Two tactical cards are drawn every turn, on top of whatever is already held. */
export { TACTICAL_HAND_SIZE as HAND_SIZE }

/**
 * The next card to ask the deck for, or null when this turn's draw is accounted for.
 *
 * `drawnThisTurn` is the count the battle already recorded; `asked` is what this
 * prompt has requested and not yet seen come back. Counting both is the whole point:
 * a request is in flight for a moment before it lands, and without it a turn's draw
 * of one gets asked for again before the first arrives. A card already held is never
 * dealt again, whatever the deck still lists.
 */
export function nextDraw<T extends { key: string }>(
  drawnThisTurn: number,
  asked: ReadonlySet<string>,
  held: readonly { key: string }[],
  deck: readonly T[],
): T | null {
  const outstanding = [...asked].filter((key) => !held.some((card) => card.key === key)).length
  if (drawnThisTurn + outstanding >= TACTICAL_HAND_SIZE) return null
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

/** The category total already banked in the battle round being settled. */
export function scoredThisRound(round: { primary: number; secondary: number }, category: 'primary' | 'secondary') {
  return category === 'primary' ? round.primary : round.secondary
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

/** A ceiling the mission states, which one it is, and how much of it is left. */
export type CapRoom = { scope: 'round' | 'battle'; cap: number; room: number }

/**
 * The tighter of the two ceilings a category is still under, or null when there is none.
 *
 * Never guessed: a ceiling only refuses a score when the mission itself states it, and
 * a round that is equally tight as the battle is reported as the round, because that
 * one is the one the player can do something about next round.
 */
export function capRoom(caps: { round: number | null; game: number | null }, banked: { round: number; game: number }): CapRoom | null {
  const stated: CapRoom[] = []
  if (caps.round !== null) stated.push({ scope: 'round', cap: caps.round, room: Math.max(0, caps.round - banked.round) })
  if (caps.game !== null) stated.push({ scope: 'battle', cap: caps.game, room: Math.max(0, caps.game - banked.game) })
  return stated.reduce<CapRoom | null>((tightest, entry) => (tightest && tightest.room <= entry.room ? tightest : entry), null)
}

/**
 * What a settlement actually banks once those ceilings have taken their cut.
 *
 * The allowance belongs to the mission, not to a card: two secondaries due at once draw
 * from the one shared pool. What the board paid is still claimed in full — the excess
 * simply does not add to the total, the same way the rules book counts it.
 *
 * A pool too small for every claim is spent in the order the cards are given, which is
 * the order the player is reading them in. Nothing in the rules picks a winner here, so
 * the one thing this must not do is pick one the player cannot see.
 */
export function settleAgainstCaps<T extends { category: 'primary' | 'secondary' }>(
  claims: readonly { card: T; claimed: number }[],
  room: { primary: number; secondary: number },
): { card: T; claimed: number; scoring: number }[] {
  const left = { ...room }
  return claims.map(({ card, claimed }) => {
    const scoring = Math.max(0, Math.min(claimed, left[card.category]))
    left[card.category] -= scoring
    return { card, claimed, scoring }
  })
}
