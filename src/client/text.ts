import { capitalised } from '../core/text'

export { countLabel, formatList } from '../core/text'

/** Domain refusals are written as clauses; the screen shows them as a sentence. */
export function asSentence(reason: string) {
  const text = capitalised(reason.trim())
  return !text || /[.!?…]$/.test(text) ? text : `${text}.`
}

/** A change with its sign, using the typographic minus that `Intl` does not. */
export const signedLabel = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value)}`

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`

const ORDINAL = new Intl.PluralRules('en-GB', { type: 'ordinal' })
const SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: 'st', two: 'nd', few: 'rd' }
/** A finishing place, such as "1st" or "3rd". */
export const placingLabel = (placing: number) => `${placing}${SUFFIX[ORDINAL.select(placing)] ?? 'th'}`

export { matchesSearch } from '../core/text'
