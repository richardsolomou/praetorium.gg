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

/** Typographic and modifier-letter apostrophes as a plain one. */
export const plainQuotes = (text: string) => text.replaceAll(/[‘’ʼ]/g, "'")

/** Letters and digits only, lower case and without diacritics: the key two spellings of one name share. */
export const joinKey = (nameOrSlug: string) =>
  nameOrSlug
    .normalize('NFD')
    .replaceAll(/\p{M}+/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

export const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** "a, b and c": the house style has no serial comma. */
export const formatList = (items: readonly string[]) =>
  items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
