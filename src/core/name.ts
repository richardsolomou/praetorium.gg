export const normalizedName = (value: string) =>
  value.normalize('NFC').toLowerCase().replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ').trim()

export function normalizedNameVariants(name: string): string[] {
  const normalized = normalizedName(name)
  const alternate = normalized.endsWith('ies')
    ? `${normalized.slice(0, -3)}y`
    : normalized.endsWith('s')
      ? normalized.slice(0, -1)
      : normalized.endsWith('y') && !/[aeiou]y$/.test(normalized)
        ? `${normalized.slice(0, -1)}ies`
        : `${normalized}s`
  return [normalized, alternate]
}

/** Non-matched-play variants are marked only by a suffix in the community data. */
const NON_MATCHED_PLAY = /\s*\[(legends|crucible)\]/i

export type NonMatchedPlayKind = 'legends' | 'crucible'

export const nonMatchedPlayKind = (name: string) => (name.match(NON_MATCHED_PLAY)?.[1]?.toLowerCase() as NonMatchedPlayKind) ?? null

export const isNonMatchedPlayName = (name: string) => nonMatchedPlayKind(name) !== null

export const matchedPlayName = (name: string) => name.replace(NON_MATCHED_PLAY, '')
