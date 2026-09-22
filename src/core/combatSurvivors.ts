import type { Datasheet } from '../contracts/catalogue'
import { datasheetProfileKind } from './datasheetStructure'
import { sameWargear } from './wargear'
import type { CombatCarrier } from './combatLoadout'

/** Casualty totals identify the weapons only when every model carries the same loadout. */
export function combatSurvivors(carriers: readonly CombatCarrier[], models: number): CombatCarrier[] | null {
  const total = carriers.reduce((sum, carrier) => sum + carrier.models, 0)
  if (models === total) return [...carriers]
  if (models < 1 || models > total || !carriers.length) return null
  const loadouts = carriers.map((carrier) =>
    carrier.weapons
      .map((weapon) => ({ name: weapon.name, count: weapon.count / carrier.models }))
      .toSorted((a, b) => a.name.localeCompare(b.name)),
  )
  if (
    loadouts.some(
      (weapons) => weapons.some((weapon) => !Number.isInteger(weapon.count)) || JSON.stringify(weapons) !== JSON.stringify(loadouts[0]),
    )
  )
    return null
  return [{ name: carriers[0]!.name, models, weapons: loadouts[0]!.map((weapon) => ({ ...weapon, count: weapon.count * models })) }]
}

export function validCombatSurvivors(original: readonly CombatCarrier[], survivors: readonly CombatCarrier[], models: number) {
  return (
    survivors.length === original.length &&
    survivors.reduce((sum, carrier) => sum + carrier.models, 0) === models &&
    survivors.every((carrier, index) => {
      const source = original[index]!
      return (
        Number.isInteger(carrier.models) &&
        carrier.models >= 0 &&
        carrier.models <= source.models &&
        carrier.weapons.length === source.weapons.length &&
        carrier.weapons.every((weapon, at) => {
          const equipped = source.weapons[at]!
          const perModel = Math.ceil(equipped.count / source.models)
          const minimum = Math.max(0, equipped.count - (source.models - carrier.models) * perModel)
          const maximum = Math.min(equipped.count, carrier.models * perModel)
          return weapon.name === equipped.name && Number.isInteger(weapon.count) && weapon.count >= minimum && weapon.count <= maximum
        })
      )
    })
  )
}

export function combatSurvivorSheet(sheet: Datasheet, original: readonly CombatCarrier[], survivors: readonly CombatCarrier[]): Datasheet {
  const count = (carriers: readonly CombatCarrier[], name: string) =>
    carriers.reduce(
      (sum, carrier) =>
        sum + carrier.weapons.filter((weapon) => sameWargear(weapon.name, name)).reduce((total, weapon) => total + weapon.count, 0),
      0,
    )
  return {
    ...sheet,
    profiles: sheet.profiles.flatMap((profile) => {
      const kind = datasheetProfileKind(profile.type)
      if (kind !== 'ranged-weapon' && kind !== 'melee-weapon') return [profile]
      if (count(original, profile.name) !== profile.count) return [profile]
      const remaining = count(survivors, profile.name)
      return remaining ? [{ ...profile, count: remaining }] : []
    }),
  }
}
