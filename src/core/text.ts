import { normalizedName } from './name'

export const sameText = (left: string, right: string) => normalizedName(left) === normalizedName(right)

export function compareText(left: string, right: string) {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export const escapeRegExp = (value: string) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

const list = new Intl.ListFormat('en-GB', { type: 'conjunction' })

/** "a, b and c": the house style has no serial comma. */
export const formatList = (items: readonly string[]) => list.format(items)
