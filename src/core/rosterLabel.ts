/**
 * What a list is called when it has no name of its own.
 *
 * A player who has not named a list still has to tell it apart from the four others
 * they brought, and the facts that do that are the ones they would have typed: the
 * detachment, the size, and the two models the list is built around. So this reads
 * them back out of the list — "HL 1K - C'tan & Hexmark" — rather than repeating the
 * faction and detachment the interface already draws as chips beside it.
 *
 * Nothing here is stored. A label is folded from the list every time it is asked
 * for, so it cannot go stale when a detachment changes, and a name the player typed
 * is never touched: a list has a name or it has this, never both.
 *
 * Pure, like the rest of `src/core`.
 */

import { ROSTER_NAME_MAX_LENGTH } from './battle'

export type LabelUnit = {
  name: string
  points: number
  /** Whether this pick carries the Warlord toggle. */
  warlord?: boolean
}

export type LabelInput = {
  /** The faction as the interface names it, used only when no detachment is picked yet. */
  factionName?: string
  detachmentNames?: readonly string[]
  limit: number
  /** The priced units, in roster order. Absent while a library row waits for its totals. */
  units?: readonly LabelUnit[]
}

/** Articles carry no identity: "The Swarmlord" is the Swarmlord. */
const ARTICLES = new Set(['the', 'a', 'an'])

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

/**
 * What a model is known by.
 *
 * Games Workshop usually writes a character as a name with a description hung off
 * it — a C'tan Shard of the Nightbringer, Hexmark Destroyer — and the word a player
 * says out loud is the first one. A name that opens with an article is the other
 * shape: "The Silent King" is the whole name, so only the article comes off, and
 * shortening it to its first word would leave "Silent".
 *
 * It is still not always the right word: a Chaplain Grimaldus shortens to Chaplain.
 * That is a suggestion being slightly wrong, which the player can type over, rather
 * than a fact being reported wrongly.
 */
function keyword(name: string): string {
  const words = name
    .split(/\s+/)
    .map((word) => word.replaceAll(EDGE_PUNCTUATION, ''))
    .filter(Boolean)
  if (!words.length) return name.trim()
  const [first, ...rest] = words
  if (ARTICLES.has(first!.toLocaleLowerCase())) return rest.join(' ') || first!
  return first!
}

/**
 * The detachments as a player writes them down: initials, run together.
 *
 * "Hypercrypt Legion" is HL and a Cursed Legion beside a Skyshroud Spearhead is
 * CLSS. One initial says nothing, so a single-word detachment keeps its word.
 */
function detachmentShorthand(names: readonly string[]): string {
  const initials = names
    .flatMap((name) => name.split(/\s+/))
    .map((word) => word.replaceAll(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean)
    .map((word) => word[0]!.toLocaleUpperCase())
    .join('')
  return initials.length > 1 ? initials : names.join(' ')
}

/** Thousands read as 1K and 2K; anything else, including King of the Colosseum's 600, reads as itself. */
const sizeShorthand = (limit: number) => (limit >= 1000 && limit % 1000 === 0 ? `${limit / 1000}K` : String(limit))

/**
 * The models the list is built around: its centrepiece and whoever is leading it.
 *
 * The most expensive unit is what the list spent its points on, and the Warlord is
 * what it is trying to do with them. When they are the same model there is one name
 * to say, and saying it once is the honest answer rather than reaching for a third.
 */
function noteworthy(units: readonly LabelUnit[]): string[] {
  const priciest = units.reduce<LabelUnit | undefined>((best, unit) => (unit.points > (best?.points ?? -1) ? unit : best), undefined)
  const warlord = units.find((unit) => unit.warlord)
  const named: string[] = []
  for (const unit of [priciest, warlord]) {
    const word = unit && keyword(unit.name)
    if (word && !named.includes(word)) named.push(word)
  }
  return named
}

/**
 * The label, at most `ROSTER_NAME_MAX_LENGTH` long.
 *
 * A list too long to say in full loses its second model before it loses letters, so
 * what survives is still a whole word rather than a truncated one.
 */
export function rosterLabel({ factionName, detachmentNames = [], limit, units = [] }: LabelInput): string {
  const head = [detachmentNames.length ? detachmentShorthand(detachmentNames) : factionName?.trim(), sizeShorthand(limit)]
    .filter(Boolean)
    .join(' ')
  const named = noteworthy(units)
  for (let count = named.length; count > 0; count--) {
    const candidate = `${head} - ${named.slice(0, count).join(' & ')}`
    if (candidate.length <= ROSTER_NAME_MAX_LENGTH) return candidate
  }
  return head.slice(0, ROSTER_NAME_MAX_LENGTH)
}
