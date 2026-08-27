/**
 * What a mission card says, in the words a player would check it in.
 *
 * The reference sheet and the prompt that asks whether a card paid out have to say
 * the same thing about the same card, so both read these rather than each writing
 * their own phrasing.
 */
import { appliesInMode, type MissionAward } from '../core/scoring'

export type { MissionAward } from '../core/scoring'

export const missionFlavourText = (text: string | null, type: string, awards: readonly MissionAward[] = []) =>
  type === 'Secondary mission' && !awards.some((award) => award.criteria === null) ? null : text

/**
 * What to call a payout the source described only in the card's own words.
 *
 * Nothing is invented for it. Payouts in one group are tiers of the same thing, so
 * the one that pays less is the lower tier, and that much follows from the numbers.
 * What each tier asks for is in the card's text, which is the only place the source
 * says it, so the text is shown alongside.
 */
export function payoutLabel(award: MissionAward, siblings: readonly MissionAward[]): string {
  const tiers = siblings.filter((other) => alternatives(award, other) && conditionLabel(other) === null)
  if (tiers.length === 2) {
    const [lower] = tiers.toSorted((left, right) => left.vp - right.vp)
    return award === lower ? 'The lower payout.' : 'The higher payout.'
  }
  return 'As the card describes.'
}

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

/** What taking a payout that many times actually pays, never past the card's ceiling. */
export function awardTotal(award: Pick<MissionAward, 'vp' | 'max' | 'per'>, times: number): number {
  const raw = award.per ? award.vp * times : award.vp * Math.min(times, 1)
  return award.max === null ? raw : Math.min(raw, award.max)
}

export function timingLabel(trigger: MissionAward['trigger']) {
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

/**
 * What a payout asks for, or null when the pack did not say.
 *
 * The sentence is the mission pack's, not ours: paraphrasing a condition id into
 * English is a second wording of the same rule, free to drift from the card a player
 * is holding. Where the pack's payouts cannot be matched to this card's, the row
 * falls back to naming the payout and the card's own text stands beside it.
 */
export const conditionLabel = (award: MissionAward): string | null => award.criteria

export function roundLabel(min: number | null, max: number | null) {
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

export const groupKey = (award: MissionAward) =>
  [award.mode, award.trigger.timing, award.trigger.phase, award.trigger.playerTurn, award.trigger.roundMin, award.trigger.roundMax].join(
    '|',
  )
export const title = (value: string) => value.replaceAll('-', ' ').replaceAll(/\b\w/g, (letter) => letter.toLocaleUpperCase())
