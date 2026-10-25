import { plainQuotes, plainDashes } from './text'
export const normalizeKeywordSelector = (value: string) =>
  plainQuotes(plainDashes(value.replaceAll(/\^\^|\*\*/g, '')))
    .replaceAll(/[^\p{L}\p{N}+'-]+/gu, ' ')
    .trim()
    .toLowerCase()

export function matchesKeywordSelector(selector: string, keywordNames: readonly string[]) {
  const alternatives = selector
    .replaceAll(/\^\^|\*\*/g, '')
    .split(/\s+(?:and|or)\s+|\s*,\s*/iu)
    .map(normalizeKeywordSelector)
    .filter(Boolean)
  const held = [...new Set(keywordNames.map(normalizeKeywordSelector).filter(Boolean))].toSorted(
    (left, right) => right.length - left.length,
  )
  const covered = (remaining: string): boolean =>
    held.some((keyword) => remaining === keyword || (remaining.startsWith(`${keyword} `) && covered(remaining.slice(keyword.length + 1))))
  return alternatives.some(covered)
}
