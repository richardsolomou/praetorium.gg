import type { CoreAbility } from '../core/vsDataConstruction'
import { everyModelHas } from './vsDataCoreAbilities'

/**
 * A unit's deployment abilities and how it embarks, from the names of the abilities it holds. Where VS Data records the
 * datasheet's core abilities, they stand for its own Deep Strike, Infiltrators and Scouts, and only the names its
 * wargear, Enhancements and leaders give it (`granted`) add to them.
 */
export function deploymentRules(abilityNames: readonly string[], vs?: { own: readonly CoreAbility[]; granted: readonly string[] }) {
  const abilities = abilityNames.map((ability) => ability.toLocaleLowerCase())
  const deploying = vs ? vs.granted.map((ability) => ability.toLocaleLowerCase()) : abilities
  const has = (ability: 'deep-strike' | 'infiltrators' | 'scouts', named: (name: string) => boolean) =>
    (vs !== undefined && everyModelHas(vs.own, ability)) || deploying.some(named)
  return {
    formationOptions: has('deep-strike', (ability) => ability.includes('deep strike')) ? (['deep-strike'] as const) : [],
    prebattleRules: [
      ...(has('infiltrators', (ability) => ability.includes('infiltrator')) ? (['infiltrators'] as const) : []),
      ...(has('scouts', (ability) => ability.startsWith('scouts')) ? (['scouts'] as const) : []),
    ],
    ...(['authority of the inquisition', 'attachés'].some((name) => abilities.includes(name)) ? { embarksWithBodyguard: true } : {}),
    ...(abilities.includes('loyal protector') ? { embarksWithBodyguard: true, embarkedSpace: 3 } : {}),
  }
}
