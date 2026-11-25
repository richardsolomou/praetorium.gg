/**
 * What a mission card says, in the words a player would check it in.
 *
 * The reference sheet and the prompt that asks whether a card paid out have to say
 * the same thing about the same card, so both read these rather than each writing
 * their own phrasing.
 */
import { appliesInMode, type MissionAward } from '../core/scoring'
export { awardTotal } from '../core/scoring'

export type { MissionAward } from '../core/scoring'

/**
 * Whether picking one payout on a card rules another out.
 *
 * The source says so directly: payouts it puts in one group are tiers of the same
 * thing, and only the better tier scores. Anything it leaves ungrouped is a payout
 * in its own right, and a card can pay several of them in the same breath.
 */
export function alternatives(chosen: Pick<MissionAward, 'group'>, other: Pick<MissionAward, 'group'>) {
  return chosen.group !== null && chosen.group === other.group
}

/** How a payout relates to the one printed immediately before it. */
export function payoutJoin(award: Pick<MissionAward, 'group'>, previous: Pick<MissionAward, 'group'> | undefined): 'or' | 'plus' | null {
  if (!previous) return null
  return alternatives(award, previous) ? 'or' : 'plus'
}

/**
 * Whether a payout is counted rather than answered yes or no.
 *
 * A payout per something is a count, unless the card made it a tier: a tier is one
 * of several ways the same thing pays, so the question is which tier, not how many.
 */
export function counted(award: Pick<MissionAward, 'per' | 'group'>) {
  return award.per !== null && award.group === null
}

/**
 * How many times a per-something payout is worth taking, or null when nothing bounds it.
 *
 * Rounded up, not down: a card paying 2 VP each up to 5 still pays on the third one,
 * it just stops at 5. Counting to two would quietly cost a point.
 */
export function awardLimit(award: Pick<MissionAward, 'vp' | 'max'>): number | null {
  if (award.max === null || award.vp <= 0) return null
  return Math.max(1, Math.ceil(award.max / award.vp))
}

export function timingLabel(trigger: MissionAward['trigger']) {
  if (trigger.timing === 'end-of-battle') return 'End of battle'
  if (trigger.timing === 'end-of-turn-or-final-round') return 'End of your opponent’s turn or the fifth battle round'
  const owner =
    trigger.playerTurn === 'your-turn'
      ? 'your'
      : trigger.playerTurn === 'opponent-turn'
        ? 'your opponent’s'
        : trigger.playerTurn === 'either'
          ? 'either player’s'
          : null
  if (trigger.timing === 'end-of-turn') return `End of ${owner ? `${owner} ` : ''}turn`
  if (trigger.timing === 'end-of-phase')
    return `End of ${owner ? `${owner} ` : ''}${trigger.phase ? `${title(trigger.phase)} phase` : 'phase'}`
  return [
    trigger.timing ? title(trigger.timing) : null,
    trigger.phase ? `${title(trigger.phase)} phase` : null,
    owner ? `${title(owner)} turn` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** The token a battle saved for what a payout asks for, or null when it saved none. */
export const conditionLabel = (award: MissionAward): string | null => award.criteria

export function roundLabel(trigger: MissionAward['trigger']): string | null {
  if (trigger.timing === 'end-of-battle') return null
  const { roundMin: min, roundMax: max } = trigger
  if (min === null && max === null) return 'Any battle round'
  if (min === null && max === 2) return 'First & second battle rounds'
  if (min !== null && max !== null && min === max) return `Battle round ${min}`
  if (min !== null && max !== null) return `Battle rounds ${min}–${max}`
  if (min !== null) return `Battle round ${min} onwards`
  return `Through battle round ${max}`
}

/**
 * Whether a payout is one the side can actually use.
 *
 * A few cards print a fixed payout and a tactical one, and a payout with no mode
 * belongs to both. Asked once because the sheet that prints a card and the prompt
 * that asks whether it paid out have to admit exactly the same payouts — two copies
 * of this is a card advertising a payout the prompt will never offer.
 */
export { appliesInMode }

const triggerKey = (trigger: MissionAward['trigger']) =>
  [trigger.timing, trigger.phase, trigger.playerTurn, trigger.roundMin, trigger.roundMax].join('|')
/** The payouts that print under one heading: the same mode, claimed at the same moments. */
export const groupKey = ({ award, triggers }: { award: MissionAward; triggers: readonly MissionAward['trigger'][] }) =>
  [award.mode, ...triggers.map(triggerKey)].join('/')
/** When an award is claimed, every moment of it, for a line of text. */
export const momentsLabel = (triggers: readonly MissionAward['trigger'][]) =>
  triggers.map((trigger) => [timingLabel(trigger), roundLabel(trigger)].filter(Boolean).join(' · ')).join(' or ')
export const title = (value: string) => value.replaceAll('-', ' ').replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase())
