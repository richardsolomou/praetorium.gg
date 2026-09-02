export const normalizedName = (name: string) => name.toLocaleLowerCase().replaceAll('\u00a0', ' ').replaceAll(/\s+/g, ' ').trim()

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
const NON_MATCHED_PLAY = /\s*\[(?:legends|crucible)\]/i

export const isNonMatchedPlayName = (name: string) => NON_MATCHED_PLAY.test(name)

export const matchedPlayName = (name: string) => name.replace(NON_MATCHED_PLAY, '')
