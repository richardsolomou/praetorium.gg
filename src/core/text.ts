import { normalizedName } from './name'

export const sameText = (left: string, right: string) => normalizedName(left) === normalizedName(right)

export function compareText(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

/** JSON with every object's keys sorted, so equal values serialise alike. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, field: unknown) =>
    field && typeof field === 'object' && !Array.isArray(field)
      ? Object.fromEntries(Object.entries(field).sort(([left], [right]) => compareText(left, right)))
      : field,
  )
}

export const capitalised = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)

/** A number as a list prints it, thousands separators included: 2,000. */
export const printedNumber = (text: string) => Number(text.replaceAll(',', ''))

/** Every dash and the minus sign as a plain hyphen. */
export const plainDashes = (text: string) => text.replaceAll(/[\p{Pd}\u2212]/gu, '-')

/** Typographic and modifier-letter apostrophes as a plain one. */
export const plainQuotes = (text: string) => text.replaceAll(/[‘’ʼ]/g, "'")

/** Without diacritics, typographic quotes or case: the form search compares text in. */
export const foldedText = (text: string) => plainQuotes(text.normalize('NFKD').replaceAll(/\p{M}/gu, '')).toLocaleLowerCase()

/** Letters and digits only, lower case and without diacritics: the key two spellings of one name share. */
export const joinKey = (nameOrSlug: string) =>
  nameOrSlug
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

export const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const countLabel = (total: number, one: string, many = `${one}s`) => `${total} ${total === 1 ? one : many}`

/** "a, b and c": British English has no serial comma. */
export const formatList = (items: readonly string[]) => new Intl.ListFormat('en-GB').format(items)
