export function compositionCount(composition: readonly string[]) {
  const alternatives: { minimum: number; maximum: number }[][] = [[]]
  for (const line of composition) {
    if (line.trim().toLocaleLowerCase() === 'or') {
      alternatives.push([])
      continue
    }
    for (const count of line.matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
      alternatives.at(-1)?.push({ minimum: Number(count[1]), maximum: Number(count[2] ?? count[1]) })
    }
  }
  const totals = alternatives.flatMap((groups) =>
    groups.length
      ? [
          {
            minimum: groups.reduce((total, group) => total + group.minimum, 0),
            maximum: groups.reduce((total, group) => total + group.maximum, 0),
          },
        ]
      : [],
  )
  if (!totals.length) return `${composition.length} ${composition.length === 1 ? 'model' : 'models'}`

  const minimum = Math.min(...totals.map((total) => total.minimum))
  const maximum = Math.max(...totals.map((total) => total.maximum))
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
  if (keywords.baseValue === undefined) return []
  const printed = new Set(splitKeywords(keywords.baseValue))
  return splitKeywords(keywords.value).filter((keyword) => !printed.has(keyword))
}

export const splitKeywords = (value: string) => value.split(',').map((keyword) => keyword.trim())

type Ability = { name: string; kind: string }

export function displayAbilities<T extends Ability>(abilities: readonly T[]): T[] {
  return abilities.filter((ability) => !['leader', 'support'].includes(ability.name.trim().toLocaleLowerCase()))
}
