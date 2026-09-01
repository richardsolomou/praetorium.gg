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
