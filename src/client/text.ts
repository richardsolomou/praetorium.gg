import { capitalised } from '../core/text'

export { countLabel, formatList } from '../core/text'

/** Domain refusals are written as clauses; the screen shows them as a sentence. */
export function asSentence(reason: string) {
  const text = capitalised(reason.trim())
  return !text || /[.!?…]$/.test(text) ? text : `${text}.`
}

/** A change with its sign, using the typographic minus that `Intl` does not. */
export const signedLabel = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : '±'}${Math.abs(value)}`

/** A word with its indefinite article by its first letter, which holds for every faction and battle size name. */
export const withArticle = (word: string) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`

export { matchesSearch, placingLabel } from '../core/text'
