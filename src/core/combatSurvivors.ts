import type { Datasheet } from './datasheet'
import { datasheetProfileKind } from './datasheetStructure'
import { combatEquipmentMatches, type CombatCarrier } from './combatLoadout'

/** Casualty totals identify the weapons only when every model carries the same loadout. */
export function combatSurvivors(carriers: readonly CombatCarrier[], models: number): CombatCarrier[] | null {
  const total = carriers.reduce((sum, carrier) => sum + carrier.models, 0)
  if (models === total) return [...carriers]
  if (models < 1 || models > total || !carriers.length) return null
  if (carriers.some((carrier) => carrier.unitWide)) return null
  const loadouts = carriers.map((carrier) =>
    carrier.weapons.map((weapon) => ({ ...weapon, count: weapon.count / carrier.models })).toSorted((a, b) => a.name.localeCompare(b.name)),
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
        carrier.unitWide === source.unitWide &&
        carrier.weapons.length === source.weapons.length &&
        carrier.weapons.every((weapon, at) => {
          const equipped = source.weapons[at]!
          const { minimum, maximum } = combatSurvivorWeaponBounds(source, at, carrier.models, models)
          return (
            weapon.name === equipped.name &&
            JSON.stringify(weapon.profileIds) === JSON.stringify(equipped.profileIds) &&
            Number.isInteger(weapon.count) &&
            weapon.count >= minimum &&
            weapon.count <= maximum
          )
        })
      )
    })
  )
}

export function combatSurvivorWeaponBounds(source: CombatCarrier, weaponIndex: number, remaining: number, models: number) {
  const equipped = source.weapons[weaponIndex]!
  if (source.unitWide) return { minimum: 0, maximum: models > 0 ? equipped.count : 0 }
  const perModel = Math.ceil(equipped.count / source.models)
  return {
    minimum: Math.max(0, equipped.count - (source.models - remaining) * perModel),
    maximum: Math.min(equipped.count, remaining * perModel),
  }
}

export function combatSurvivorSheet(sheet: Datasheet, original: readonly CombatCarrier[], survivors: readonly CombatCarrier[]): Datasheet {
  const count = (carriers: readonly CombatCarrier[], profile: Datasheet['profiles'][number]) =>
    carriers.reduce(
      (sum, carrier) =>
        sum +
        carrier.weapons.filter((weapon) => combatEquipmentMatches(weapon, profile)).reduce((total, weapon) => total + weapon.count, 0),
      0,
    )
  return {
    ...sheet,
    profiles: sheet.profiles.flatMap((profile) => {
      const kind = datasheetProfileKind(profile.type)
      if (kind !== 'ranged-weapon' && kind !== 'melee-weapon') return [profile]
      if (count(original, profile) !== profile.count) return [profile]
      const remaining = count(survivors, profile)
      return remaining ? [{ ...profile, count: remaining }] : []
    }),
  }
}
