import type { CatalogueIndex, Definition, Profile } from './catalogue'
import type { StructuredDatasheetProfile } from './datasheet'
import { storesUnitTotal } from './collective'
import { resolve } from './definitions'
import { datasheetProfileKind } from './datasheetStructure'
import type { Selection } from './evaluate'
import { sameWargear, wargearKey, wargearOf, type Wargear } from './wargear'

export type CombatEquipment = Wargear & { profileIds?: string[] }
export type CombatCarrier = { name: string; models: number; weapons: CombatEquipment[]; unitWide?: boolean }

export const referenceOnlyWeapon = (name: string) => /\(ref\.?\s*only\)/i.test(name)

export const combatEquipmentMatches = (piece: CombatEquipment, profile: Pick<StructuredDatasheetProfile, 'id' | 'name'>) =>
  piece.profileIds ? piece.profileIds.includes(profile.id) : sameWargear(piece.name, profile.name)

function weaponProfiles(definition: Definition, index: CatalogueIndex): Profile[] {
  const found = new Map<string, Profile>()
  const add = (profile: Profile) => {
    const kind = datasheetProfileKind(profile.typeName ?? '')
    if ((kind === 'ranged-weapon' || kind === 'melee-weapon') && !referenceOnlyWeapon(profile.name ?? '')) found.set(profile.id, profile)
  }
  for (const source of new Set([definition, resolve(definition, index)])) {
    source.profiles?.forEach(add)
    for (const link of source.infoLinks ?? []) {
      const shared = index.shared.get(link.targetId)
      if (shared && 'typeName' in shared) add({ ...shared, name: link.name ?? shared.name })
    }
  }
  return [...found.values()]
}

function profileEquipment(profiles: readonly Profile[], count: number, name?: string): CombatEquipment[] {
  const groups = new Map<string, Profile[]>()
  for (const profile of profiles) {
    const key = wargearKey(profile.name ?? profile.id)
    groups.set(key, [...(groups.get(key) ?? []), profile])
  }
  return [...groups.values()].map((group) => ({
    name: groups.size === 1 && name ? name : (group[0]!.name ?? group[0]!.id),
    count,
    profileIds: group.map((profile) => profile.id),
  }))
}

function equippedWeapons(selection: Selection, index: CatalogueIndex, models: number, skipModels = false): CombatEquipment[] {
  const found: CombatEquipment[] = []
  const walk = (node: Selection, count: number, parent?: Definition) => {
    const definition = index.definitions.get(node.id)
    if (!definition || (node.count ?? 1) <= 0) return
    const target = resolve(definition, index)
    if (skipModels && target.type === 'model') return
    const carried = parent && storesUnitTotal(definition, parent, index) ? (node.count ?? 1) : count * (node.count ?? 1)
    found.push(...profileEquipment(weaponProfiles(definition, index), carried, target.name ?? node.id))
    node.selections?.forEach((child) => walk(child, carried, definition))
  }
  walk({ ...selection, count: 1 }, models)
  return found.length ? found : wargearOf(selection, index, models)
}

/** Preserve model ownership before the datasheet merges equal weapon profiles. */
export function combatCarriers(selection: Selection, index: CatalogueIndex): CombatCarrier[] {
  const found: CombatCarrier[] = []
  const visit = (node: Selection) => {
    if ((node.count ?? 1) <= 0) return
    const definition = index.definitions.get(node.id)
    const target = definition && resolve(definition, index)
    if (target?.type === 'model') {
      found.push({ name: target.name ?? node.id, models: node.count ?? 1, weapons: equippedWeapons(node, index, node.count ?? 1) })
      return
    }
    node.selections?.forEach(visit)
  }
  visit(selection)
  const definition = index.definitions.get(selection.id)
  const name = (definition && resolve(definition, index).name) ?? selection.id
  if (!found.length) return [{ name, models: 1, weapons: equippedWeapons(selection, index, 1) }]
  const owned = new Set(found.flatMap((carrier) => carrier.weapons.flatMap((weapon) => weapon.profileIds ?? [])))
  const intrinsic = definition ? weaponProfiles(definition, index).filter((profile) => !owned.has(profile.id)) : []
  for (const carrier of found) {
    carrier.weapons.push(...profileEquipment(intrinsic, carrier.models))
  }
  const unitSelection = {
    ...selection,
    selections: selection.selections?.filter((child) => {
      const childDefinition = index.definitions.get(child.id)
      return !childDefinition || resolve(childDefinition, index).type !== 'model'
    }),
  }
  const unitWeapons = equippedWeapons(unitSelection, index, 1, true).filter((weapon) =>
    weapon.profileIds?.some((id) => !intrinsic.some((profile) => profile.id === id) && !owned.has(id)),
  )
  if (unitWeapons.length) found.push({ name: `${name} equipment`, models: 0, weapons: unitWeapons, unitWide: true })
  return found
}
