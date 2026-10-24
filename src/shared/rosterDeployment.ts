export function deploymentRules(abilityNames: readonly string[]) {
  const abilities = abilityNames.map((ability) => ability.toLocaleLowerCase())
  return {
    formationOptions: abilities.some((ability) => ability.includes('deep strike')) ? (['deep-strike'] as const) : [],
    prebattleRules: [
      ...(abilities.some((ability) => ability.includes('infiltrator')) ? (['infiltrators'] as const) : []),
      ...(abilities.some((ability) => ability.startsWith('scouts')) ? (['scouts'] as const) : []),
    ],
    ...(['authority of the inquisition', 'attachés'].some((name) => abilities.includes(name)) ? { embarksWithBodyguard: true } : {}),
    ...(abilities.includes('loyal protector') ? { embarksWithBodyguard: true, embarkedSpace: 3 } : {}),
  }
}
