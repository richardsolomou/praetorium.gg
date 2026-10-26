export const normalizedName = (value: string) => value.normalize('NFC').toLowerCase().replaceAll(/\s+/g, ' ').trim()

/** A keyword without the "Faction:" the data prefixes faction keywords with. */
export const withoutFactionPrefix = (keyword: string) => keyword.replace(/^faction:\s*/i, '')

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
export const NON_MATCHED_PLAY_KINDS = ['legends', 'crucible'] as const
export type NonMatchedPlayKind = (typeof NON_MATCHED_PLAY_KINDS)[number]

const NON_MATCHED_PLAY = new RegExp(`\\s*\\[(${NON_MATCHED_PLAY_KINDS.join('|')})\\]`, 'i')

export const nonMatchedPlayKind = (name: string) => (name.match(NON_MATCHED_PLAY)?.[1]?.toLowerCase() as NonMatchedPlayKind) ?? null

export const isNonMatchedPlayName = (name: string) => nonMatchedPlayKind(name) !== null

export const matchedPlayName = (name: string) => name.replace(NON_MATCHED_PLAY, '')
