export function deploymentRules(abilityNames: readonly string[]) {
  const abilities = abilityNames.map((ability) => ability.toLocaleLowerCase())
  return {
    formationOptions: abilities.some((ability) => ability.includes('deep strike')) ? (['deep-strike'] as const) : [],
    prebattleRules: [
      ...(abilities.some((ability) => ability.includes('infiltrator')) ? (['infiltrators'] as const) : []),
      ...(abilities.some((ability) => ability.startsWith('scouts')) ? (['scouts'] as const) : []),
    ],
  }
}

const normalizedRuleText = (description: string) =>
  description
    .normalize('NFKC')
    .replaceAll(/\*\*|<\/?[bkiu]>/giu, '')
    .replaceAll(/\s+/g, ' ')
    .trim()

export function strategicReserveExemptionSelectors(descriptions: readonly string[]): string[] {
  return descriptions.flatMap((description) => {
    const normalized = normalizedRuleText(description)
    const matches = normalized.matchAll(
      /friendly (.+?) units do not count towards the combined points value of your strategic reserves units/giu,
    )
    return [...matches].flatMap((match) => (match[1] ? [match[1]] : []))
  })
}

export function grantsStrategicReserveExemption(description: string | null): boolean {
  if (!description) return false
  return /points value does not count towards the combined points (?:value|limit).+strategic reserves?/iu.test(
    normalizedRuleText(description),
  )
}
