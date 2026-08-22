export function compositionCount(composition: readonly string[]) {
  const groups = composition.flatMap((line) => {
    const count = line.match(/(\d+)(?:\s*[-–]\s*(\d+))?/)
    return count ? [{ minimum: Number(count[1]), maximum: Number(count[2] ?? count[1]) }] : []
  })
  if (!groups.length) return `${composition.length} ${composition.length === 1 ? 'model' : 'models'}`

  const minimum = groups.reduce((total, group) => total + group.minimum, 0)
  const maximum = groups.reduce((total, group) => total + group.maximum, 0)
  const count = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`
  return `${count} ${maximum === 1 ? 'model' : 'models'}`
}

/**
 * The keywords something in the list put on a weapon: the ones the printed profile
 * does not have.
 *
 * A modifier appends to the characteristic rather than announcing what it added, so
 * the difference between what is printed and what is shown is the only statement of
 * which keyword is new. Named rather than counted, because a detachment may add one
 * keyword to a weapon that already lists three.
 */
export function addedKeywords(keywords: { value: string; baseValue?: string }): string[] {
  if (!keywords.baseValue) return []
  const printed = new Set(splitKeywords(keywords.baseValue))
  return splitKeywords(keywords.value).filter((keyword) => !printed.has(keyword))
}

export const splitKeywords = (value: string) => value.split(',').map((keyword) => keyword.trim())

type Ability = { name: string; kind: string }

export function displayAbilities<T extends Ability>(abilities: readonly T[]): T[] {
  return abilities.filter((ability) => !['leader', 'support'].includes(ability.name.trim().toLocaleLowerCase()))
}
