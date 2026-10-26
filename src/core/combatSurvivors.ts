import type { Datasheet } from './datasheet'
import { weaponPhase } from './datasheetStructure'
import { carriedCount, type CombatCarrier } from './combatLoadout'
import { combatTarget } from './combatProfiles'
import type { CombatMember } from './combatUnit'

export function combatAtHealth<T extends CombatMember>(
  unit: T,
  health: { models: number; startingModels: number; damage: number },
  allocation?: readonly CombatCarrier[],
) {
  const original = unit.carriers ?? []
  const survivors =
    allocation === undefined
      ? combatSurvivors(original, health.models, unit.sheet)
      : validCombatSurvivors(original, allocation, health.models)
        ? [...allocation]
        : null
  return {
    ...unit,
    models: health.models,
    startingModels: health.startingModels,
    damage: health.damage,
    sheet: survivors ? combatSurvivorSheet(unit.sheet, original, survivors) : unit.sheet,
    carriers: survivors ?? [],
    allocationRequired: unit.allocationRequired || !survivors,
  }
}

/** Casualty totals identify loadouts only when weapons and evaluated defences are uniform. */
export function combatSurvivors(carriers: readonly CombatCarrier[], models: number, sheet?: Datasheet): CombatCarrier[] | null {
  const total = carriers.reduce((sum, carrier) => sum + carrier.models, 0)
  if (models === total) return [...carriers]
  if (models < 1 || models > total || !carriers.length) return null
  if (carriers.some((carrier) => carrier.unitWide)) return null
  const loadouts = carriers.map((carrier) =>
    carrier.weapons.map((weapon) => ({ ...weapon, count: weapon.count / carrier.models })).toSorted((a, b) => a.name.localeCompare(b.name)),
  )
  if (
    (carriers.some((carrier) => JSON.stringify(carrier.modelProfileIds) !== JSON.stringify(carriers[0]!.modelProfileIds)) &&
      (!sheet || combatTarget(sheet, total, total, carriers).target?.groups.length !== 1)) ||
    loadouts.some(
      (weapons) => weapons.some((weapon) => !Number.isInteger(weapon.count)) || JSON.stringify(weapons) !== JSON.stringify(loadouts[0]),
    )
  )
    return null
  return [{ ...carriers[0]!, models, weapons: loadouts[0]!.map((weapon) => ({ ...weapon, count: weapon.count * models })) }]
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
        JSON.stringify(carrier.modelProfileIds) === JSON.stringify(source.modelProfileIds) &&
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
    carriers.reduce((sum, carrier) => sum + carriedCount(carrier, profile), 0)
  return {
    ...sheet,
    profiles: sheet.profiles.flatMap((profile) => {
      if (!weaponPhase(profile.type)) return [profile]
      if (count(original, profile) !== profile.count) return [profile]
      const remaining = count(survivors, profile)
      return remaining ? [{ ...profile, count: remaining }] : []
    }),
  }
}
