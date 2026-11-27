import type { VsDataDefinitions } from '../core/vsDataConstruction'
import { modelCounts, unitKeywords, type VsRoster, type VsRosterUnit } from '../core/vsDataRoster'
import { abilitiesXml, categoriesXml, costXml, profileXml, type RosterAbility, rosterXml, selectionXml } from './battleScribeRoster'

/** A stat line as VS Data's `unit-profile` record prints it, by the models it describes, or every model without `models`. */
export type VsDataUnitProfile = {
  id: string
  name: string
  models?: string[]
  movement?: number | { atLeast: number } | null
  toughness?: number
  save?: number
  wounds?: number
  leadership?: number
  objectiveControl?: number | null
  invulnerableSave?: { roll: number; against?: string; conditional?: true } | { roll: number; against?: string; conditional?: true }[]
}
/** One mode of a weapon as VS Data's `weapon-profile` record prints it for one unit. */
export type VsDataWeaponProfile = {
  id: string
  name: string
  wargear: string
  range?: number | 'melee'
  attacks?: number | string
  skill?: number | null
  strength?: number
  armourPenetration?: number
  damage?: number | string
  keywords?: string[]
}
/** Each unit's stat lines and weapon profiles, by unit ID. */
export type VsDataProfiles = {
  units: ReadonlyMap<string, readonly VsDataUnitProfile[]>
  weapons: ReadonlyMap<string, readonly VsDataWeaponProfile[]>
}

/**
 * The BSData entry IDs a `.ros` file restores: each VS Data unit's datasheet entry, and each option's wargear by the
 * BSData option entry that stands for exactly that one selection, both read from the frozen maps.
 */
export type BattleScribeEntryIds = { units: ReadonlyMap<string, string>; options: ReadonlyMap<string, string> }

/**
 * The entry IDs `catalogue/legacy-ids/units.json` and `options.json` give back for the current rules version: a VS
 * Data ID several BSData entries stand for takes the first in ID order, and an ID no frozen entry stands for stays VS
 * Data's own, which readers of the file ignore.
 */
export function battleScribeEntryIds(
  units: Readonly<Record<string, string>>,
  options: Readonly<Record<string, { choices: Readonly<Record<string, { options: Record<string, Record<string, number>> } | object>> }>>,
): BattleScribeEntryIds {
  const first = (pairs: Iterable<readonly [string, string]>) => {
    const found = new Map<string, string>()
    for (const [key, entry] of [...pairs].toSorted(([, left], [, right]) => (left < right ? -1 : 1)))
      if (!found.has(key)) found.set(key, entry)
    return found
  }
  return {
    units: first(Object.entries(units).flatMap(([entry, unit]) => (entry.includes('~') ? [] : [[unit, entry] as const]))),
    options: first(
      Object.values(options).flatMap(({ choices }) =>
        Object.entries(choices).flatMap(([key, choice]) => {
          const selections = 'options' in choice ? Object.entries(choice.options) : []
          const [option, chosen] = selections.length === 1 ? selections[0]! : []
          const taken = chosen ? Object.entries(chosen) : []
          return option && taken.length === 1 && taken[0]![1] === 1 ? [[`${option}|${taken[0]![0]}`, key.split('|')[1]!] as const] : []
        }),
      ),
    ),
  }
}

export type VsDataRosterFileUnit = {
  picked: VsRosterUnit
  points: number
  nickname?: string
  /** The datasheet entry the pick was saved as, written in place of the frozen map's. */
  entryId?: string
  abilities: readonly RosterAbility[]
}

/**
 * A list as the BattleScribe `.ros` XML Yellowscribe reads into Tabletop Simulator, built from VS Data alone: each unit's
 * models at their counts, the wargear each carries numbered by the unit's total as BattleScribe numbers it, VS Data's
 * stat lines and keywords, and the abilities given. BSData entry IDs come back through the frozen maps where they exist.
 */
export function vsDataBattleScribeRoster(
  data: {
    name: string
    catalogueId: string
    faction: string
    detachments: string[]
    points: number
    units: readonly VsDataRosterFileUnit[]
  },
  definitions: VsDataDefinitions,
  profiles: VsDataProfiles,
  entryIds: BattleScribeEntryIds,
) {
  const roster: VsRoster = { faction: data.faction, detachments: data.detachments, units: data.units.map((unit) => unit.picked) }
  return rosterXml({
    name: data.name,
    catalogueId: data.catalogueId,
    catalogueName: definitions.get('faction', data.faction)?.name ?? '',
    points: data.points,
    units: data.units.flatMap((unit) => {
      const xml = unitXml(unit, roster, definitions, profiles, entryIds)
      return xml ? [xml] : []
    }),
  })
}

function unitXml(
  { picked, points, nickname, entryId, abilities }: VsDataRosterFileUnit,
  roster: VsRoster,
  definitions: VsDataDefinitions,
  profiles: VsDataProfiles,
  entryIds: BattleScribeEntryIds,
) {
  const unit = definitions.get('unit', picked.unit)
  if (!unit) return null
  const counts = modelCounts(definitions, picked)
  const models = definitions.modelsOf(picked.unit).filter((model) => (counts.get(model.id) ?? 0) > 0)
  const held = heldBy(definitions, picked, models.length === 1 ? models[0]!.id : '')
  const weapons = new Map<string, VsDataWeaponProfile[]>()
  for (const profile of profiles.weapons.get(picked.unit) ?? [])
    weapons.set(profile.wargear, [...(weapons.get(profile.wargear) ?? []), profile])
  const wargearXml = (wargear: string, number: number, option?: string): string => {
    const definition = definitions.get('wargear', wargear)
    const modes = weapons.get(wargear) ?? []
    const name = definition?.name ?? wargear
    return selectionXml(
      { entryId: (option && entryIds.options.get(`${option}|${wargear}`)) || wargear, name, number, type: 'upgrade' },
      modes.map((mode) => weaponXml(mode, modes.length > 1 ? name : undefined)),
      [],
      Object.entries(definition?.data.includes ?? {}).map(([inner, n]) => wargearXml(inner, number * n)),
    )
  }
  const carriedXml = (holder: string) =>
    [...(held.get(holder) ?? [])].flatMap(([wargear, { count, option }]) => (count > 0 ? [wargearXml(wargear, count, option)] : []))
  // A stat line naming models hangs off the first of them fielded, or nothing; one without describes every model.
  const statlines = profiles.units.get(picked.unit) ?? []
  const placedOn = (profile: VsDataUnitProfile) =>
    profile.models ? (profile.models.find((model) => (counts.get(model) ?? 0) > 0) ?? null) : undefined
  const statlinesOf = (holder: string | undefined) => statlines.filter((profile) => placedOn(profile) === holder).map(statlineXml)
  const { profiles: described, rules } = abilitiesXml(abilities)
  const details = [rules, categoriesXml(unitKeywords(unit.data, roster, picked.allegiance)), costXml(points)]
  const own = { entryId: entryId ?? entryIds.units.get(unit.id) ?? unit.id, name: unit.name, customName: nickname }
  // BattleScribe writes a unit only ever one model as that model, and a unit that could field more as a unit.
  const single = models.length === 1 && unit.data.sizes.every((size) => size === 1)
  if (single)
    return selectionXml({ ...own, number: 1, type: 'model' }, [...statlines.map(statlineXml), ...described], details, [
      ...carriedXml(''),
      ...carriedXml(models[0]!.id),
    ])
  return selectionXml({ ...own, number: 1, type: 'unit' }, [...statlinesOf(undefined), ...described], details, [
    ...models.map((model) =>
      selectionXml(
        { entryId: model.id, name: model.name, number: counts.get(model.id)!, type: 'model' },
        statlinesOf(model.id),
        [],
        carriedXml(model.id),
      ),
    ),
    ...carriedXml(''),
  ])
}

/**
 * What each fielded model carries in all and what the unit holds apart from its models (`''`), each with the option it
 * was taken through: a model's own wargear, and an option's choices on its carrier, else on `sole`, the unit's one kind
 * of model, else the unit's. What a choice replaces comes off the same holder first, then any other holding it.
 */
function heldBy(definitions: VsDataDefinitions, picked: VsRosterUnit, sole: string) {
  const held = new Map<string, Map<string, { count: number; option?: string }>>()
  const add = (holder: string, wargear: string, n: number, option?: string) => {
    const bag = held.get(holder) ?? held.set(holder, new Map()).get(holder)!
    const item = bag.get(wargear)
    bag.set(wargear, { count: (item?.count ?? 0) + n, option: item?.option ?? option })
  }
  const take = (holder: string, wargear: string, n: number) => {
    let left = n
    for (const from of [holder, ...[...held.keys()].filter((other) => other !== holder)]) {
      const item = held.get(from)?.get(wargear)
      if (!item || item.count <= 0 || !left) continue
      const taken = Math.min(item.count, left)
      item.count -= taken
      left -= taken
    }
  }
  const counts = modelCounts(definitions, picked)
  for (const model of definitions.modelsOf(picked.unit))
    for (const [wargear, n] of Object.entries(model.data.wargear))
      if (counts.get(model.id)) add(model.id, wargear, n * counts.get(model.id)!)
  for (const [wargear, n] of Object.entries(definitions.get('unit', picked.unit)?.data.wargear ?? {})) add(sole, wargear, n)
  for (const option of definitions.optionsOf(picked.unit))
    for (const [wargear, n] of Object.entries(picked.options?.[option.id] ?? {})) {
      if (!(n > 0)) continue
      const holder = option.data.carrier ?? sole
      add(holder, wargear, n, option.id)
      for (const [replaced, k] of Object.entries(option.data.replaces ?? {})) take(holder, replaced, n * k)
    }
  return held
}

const roll = (value: number | undefined) => (value === undefined ? '-' : `${value}+`)
const inches = (value: number | { atLeast: number } | null | undefined) =>
  value === null || value === undefined ? '-' : typeof value === 'number' ? `${value}"` : `${value.atLeast}+"`
const plain = (value: number | string | null | undefined) => (value === null || value === undefined ? '-' : String(value))

/** A stat line under BattleScribe's characteristic names, the invulnerable save only where it holds against every attack. */
function statlineXml(profile: VsDataUnitProfile) {
  const saves = profile.invulnerableSave === undefined ? [] : [profile.invulnerableSave].flat()
  const invulnerable = saves.length === 1 && !saves[0]!.against && !saves[0]!.conditional ? saves[0]!.roll : undefined
  return profileXml(profile.id, profile.name, 'Unit', [
    { name: 'M', value: inches(profile.movement) },
    { name: 'T', value: plain(profile.toughness) },
    { name: 'SV', value: roll(profile.save) },
    { name: 'W', value: plain(profile.wounds) },
    { name: 'LD', value: roll(profile.leadership) },
    { name: 'OC', value: plain(profile.objectiveControl) },
    ...(invulnerable === undefined ? [] : [{ name: 'InSv', value: roll(invulnerable) }]),
  ])
}

/** A weapon mode under BattleScribe's characteristic names; a weapon of several modes names each `➤ <weapon> - <mode>`. */
function weaponXml(profile: VsDataWeaponProfile, weapon: string | undefined) {
  const { range } = profile
  const melee = range === 'melee'
  const mode = weapon && !profile.name.toLowerCase().startsWith(weapon.toLowerCase()) ? `${weapon} - ${profile.name}` : profile.name
  return profileXml(profile.id, weapon ? `➤ ${mode}` : profile.name, melee ? 'Melee Weapons' : 'Ranged Weapons', [
    { name: 'Range', value: range === 'melee' ? 'Melee' : inches(range) },
    { name: 'A', value: plain(profile.attacks) },
    { name: melee ? 'WS' : 'BS', value: profile.skill === null ? '-' : roll(profile.skill) },
    { name: 'S', value: plain(profile.strength) },
    { name: 'AP', value: plain(profile.armourPenetration) },
    { name: 'D', value: plain(profile.damage) },
    { name: 'Keywords', value: profile.keywords?.length ? profile.keywords.join(', ') : '-' },
  ])
}
