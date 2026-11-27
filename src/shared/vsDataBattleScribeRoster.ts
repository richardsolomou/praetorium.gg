import type { Definition, VsDataDefinitions } from '../core/vsDataConstruction'
import { modelCounts, unitKeywords, type VsRoster, type VsRosterUnit } from '../core/vsDataRoster'
import { abilitiesXml, categoriesXml, costXml, profileXml, type RosterAbility, selectionXml } from './battleScribeXml'

export type VsDataRosterFileUnit = {
  picked: VsRosterUnit
  /** The datasheet entry the pick was saved as, which BattleScribe readers expect as the unit's entry. */
  entryId: string
  points: number
  nickname?: string
  abilities: readonly RosterAbility[]
}

/**
 * One unit of a `.ros` file built from VS Data alone: its models at their counts, the wargear each carries numbered by
 * the unit's total as BattleScribe numbers it, VS Data's stat lines and keywords, and the abilities given. Below the unit,
 * entries are VS Data IDs, which Yellowscribe does not read.
 */
export function vsDataUnitXml(
  { picked, entryId, points, nickname, abilities }: VsDataRosterFileUnit,
  roster: VsRoster,
  definitions: VsDataDefinitions,
) {
  const unit = definitions.get('unit', picked.unit)
  if (!unit) return null
  const counts = modelCounts(definitions, picked)
  const models = definitions.modelsOf(picked.unit).filter((model) => (counts.get(model.id) ?? 0) > 0)
  const held = heldBy(definitions, picked, models.length === 1 ? models[0]!.id : '')
  // A weapon profile naming no wargear (a `no-target` gap) has nothing in the unit to hang off.
  const weapons = new Map<string, Definition<'weapon-profile'>[]>()
  for (const profile of definitions.weaponProfilesOf(picked.unit))
    if (profile.data.wargear) weapons.set(profile.data.wargear, [...(weapons.get(profile.data.wargear) ?? []), profile])
  const wargearXml = (wargear: string, number: number): string => {
    const definition = definitions.get('wargear', wargear)
    const modes = weapons.get(wargear) ?? []
    const name = definition?.name ?? wargear
    return selectionXml(
      { entryId: wargear, name, number, type: 'upgrade' },
      modes.map((mode) => weaponXml(mode, modes.length > 1 ? name : undefined)),
      [],
      Object.entries(definition?.data.includes ?? {}).map(([inner, n]) => wargearXml(inner, number * n)),
    )
  }
  const carriedXml = (holder: string) =>
    [...(held.get(holder) ?? [])].flatMap(([wargear, count]) => (count > 0 ? [wargearXml(wargear, count)] : []))
  // A stat line naming models hangs off the first of them fielded, or nothing; one without describes every model.
  const statlines = definitions.unitProfilesOf(picked.unit)
  const placedOn = ({ data }: Definition<'unit-profile'>) =>
    data.models ? (data.models.find((model) => (counts.get(model) ?? 0) > 0) ?? null) : undefined
  const statlinesOf = (holder: string | undefined) => statlines.filter((profile) => placedOn(profile) === holder).map(statlineXml)
  const { profiles: described, rules } = abilitiesXml(abilities)
  // Yellowscribe tells a faction keyword by BattleScribe's `Faction: ` prefix.
  const factionKeywords = new Set(unit.data.factionKeywords)
  const keywords = unitKeywords(unit.data, roster, picked.allegiance).map((keyword) =>
    factionKeywords.has(keyword) ? `Faction: ${keyword}` : keyword,
  )
  const details = [rules, categoriesXml(keywords), costXml(points)]
  const own = { entryId, name: unit.name, customName: nickname }
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
 * What each fielded model carries in all and what the unit holds apart from its models (`''`): a model's own wargear,
 * and an option's choices on its carrier, else on `sole`, the unit's one kind of model, else the unit's. What a choice replaces comes off the same holder first, then any other holding it.
 */
function heldBy(definitions: VsDataDefinitions, picked: VsRosterUnit, sole: string) {
  const held = new Map<string, Map<string, number>>()
  const add = (holder: string, wargear: string, n: number) => {
    const bag = held.get(holder) ?? held.set(holder, new Map()).get(holder)!
    bag.set(wargear, (bag.get(wargear) ?? 0) + n)
  }
  const take = (holder: string, wargear: string, n: number) => {
    let left = n
    for (const from of [holder, ...[...held.keys()].filter((other) => other !== holder)]) {
      const bag = held.get(from)
      const count = bag?.get(wargear) ?? 0
      if (!bag || count <= 0 || !left) continue
      const taken = Math.min(count, left)
      bag.set(wargear, count - taken)
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
      add(holder, wargear, n)
      for (const [replaced, k] of Object.entries(option.data.replaces ?? {})) take(holder, replaced, n * k)
    }
  return held
}

const roll = (value: number | undefined) => (value === undefined ? '-' : `${value}+`)
const inches = (value: number | { atLeast: number } | null | undefined) =>
  value === null || value === undefined ? '-' : typeof value === 'number' ? `${value}"` : `${value.atLeast}+"`
const plain = (value: number | string | null | undefined) => (value === null || value === undefined ? '-' : String(value))

/** A stat line under BattleScribe's characteristic names, the invulnerable save only where it holds against every attack. */
function statlineXml({ id, name, data: profile }: Definition<'unit-profile'>) {
  const saves = profile.invulnerableSave === undefined ? [] : [profile.invulnerableSave].flat()
  const invulnerable = saves.length === 1 && !saves[0]!.against && !saves[0]!.conditional ? saves[0]!.roll : undefined
  return profileXml(id, name, 'Unit', [
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
function weaponXml({ id, name, data: profile }: Definition<'weapon-profile'>, weapon: string | undefined) {
  const { range } = profile
  const melee = range === 'melee'
  const mode = weapon && !name.toLowerCase().startsWith(weapon.toLowerCase()) ? `${weapon} - ${name}` : name
  return profileXml(id, weapon ? `➤ ${mode}` : name, melee ? 'Melee Weapons' : 'Ranged Weapons', [
    { name: 'Range', value: range === 'melee' ? 'Melee' : inches(range) },
    { name: 'A', value: plain(profile.attacks) },
    { name: melee ? 'WS' : 'BS', value: profile.skill === null ? '-' : roll(profile.skill) },
    { name: 'S', value: plain(profile.strength) },
    { name: 'AP', value: plain(profile.armourPenetration) },
    { name: 'D', value: plain(profile.damage) },
    { name: 'Keywords', value: profile.keywords?.length ? profile.keywords.join(', ') : '-' },
  ])
}
