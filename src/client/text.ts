import { capitalised, foldedText } from '../core/text'

export { formatList } from '../core/text'

/** Domain refusals are written as clauses; the screen shows them as a sentence. */
export function asSentence(reason: string) {
  const text = capitalised(reason.trim())
  return !text || /[.!?…]$/.test(text) ? text : `${text}.`
}

export const countLabel = (total: number, one: string, many = `${one}s`) => `${total} ${total === 1 ? one : many}`

export const percentLabel = (rate: number) => `${Math.round(rate * 100)}%`

/** Every word of the query appears in the text, whatever its case, accents or quote marks. */
export function matchesSearch(text: string, query: string) {
  const folded = foldedText(text)
  return foldedText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => folded.includes(word))
}
