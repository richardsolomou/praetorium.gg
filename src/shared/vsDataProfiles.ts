import type { DatasheetCharacteristicKind } from '../core/datasheet'
import type { Definition, UnitProfileData, VsDataDefinitions, WeaponProfileData } from '../core/vsDataConstruction'
import { nonMatchedPlayKind } from '../core/name'
import { modelsNamed, same, words } from './vsDataModelNames'
import { SPELLINGS } from './wargearSpellings'
import { datasheetOf, idsIn, inBook } from './vsDataPoints'

/** A stat line's values as a datasheet prints them, by characteristic; a characteristic VS Data leaves out is absent. */
export type VsStatValues = Partial<Record<DatasheetCharacteristicKind, string>>
type UnitLine = { name: string; models?: string[]; values: VsStatValues }
type WeaponLine = { keys: string[]; melee: boolean; values: VsStatValues }
/**
 * One rules version's VS Data stat lines, by the BSData entry IDs saved lists hold: each datasheet's VS Data unit, and
 * each unit's model names and stat lines, a weapon's under every name a datasheet may print it by.
 */
export type VsProfilesIndex = {
  /** Each datasheet's VS Data unit, keyed as `idsIn` keys units; a book key VS Data prints no lines for is null. */
  units: Record<string, string | null>
  lines: Record<string, { models: string[]; unit: UnitLine[]; weapons: WeaponLine[] }>
}

const UNIT_FIELDS = {
  movement: 'movement',
  toughness: 'toughness',
  save: 'save',
  wounds: 'wounds',
  leadership: 'leadership',
  'objective-control': 'objectiveControl',
} as const satisfies Partial<Record<DatasheetCharacteristicKind, keyof UnitProfileData>>
const WEAPON_FIELDS = {
  range: 'range',
  attacks: 'attacks',
  'ballistic-skill': 'skill',
  'weapon-skill': 'skill',
  strength: 'strength',
  'armour-penetration': 'armourPenetration',
  damage: 'damage',
  keywords: 'keywords',
} as const satisfies Partial<Record<DatasheetCharacteristicKind, keyof WeaponProfileData>>

const inches = (value: number) => `${value}"`
const roll = (value: number) => `${value}+`

function unitValue(field: (typeof UNIT_FIELDS)[keyof typeof UNIT_FIELDS], data: UnitProfileData): string | undefined {
  const value = data[field]
  if (value === undefined) return undefined
  if (value === null) return '-'
  if (typeof value === 'object') return `${value.atLeast}+"`
  if (field === 'movement') return inches(value)
  return field === 'save' || field === 'leadership' ? roll(value) : String(value)
}

/** A keyword VS Data prints with rules words in it, as some printed `[ONE SHOT]: …` sentences are, which no datasheet shows. */
const unreadableKeyword = (keyword: string) => /[.[\]]/.test(keyword)

/**
 * A weapon keyword spelled as the rules version's keyword glossary names its ability, its parameter as printed, so
 * `RAPID FIRE 1` reads as the glossary's `Rapid Fire 1`; one the glossary does not name keeps VS Data's spelling.
 */
function spelledKeyword(keyword: string, glossary: readonly string[]) {
  const lower = keyword.toLowerCase()
  const named = glossary
    .filter((name) => {
      const own = name.toLowerCase()
      return lower === own || (lower.startsWith(own) && (own.endsWith('-') || /^[\s:]/.test(lower.slice(own.length))))
    })
    .toSorted((left, right) => right.length - left.length)[0]
  return named ? `${named}${keyword.slice(named.length)}` : keyword
}

function weaponValue(kind: keyof typeof WEAPON_FIELDS, data: WeaponProfileData, glossary: readonly string[]): string | undefined {
  const field = WEAPON_FIELDS[kind]
  if (data.gaps?.some((gap) => gap.field === field)) return undefined
  if (field === 'keywords') {
    const keywords = data.keywords ?? []
    return keywords.some(unreadableKeyword) ? undefined : keywords.map((keyword) => spelledKeyword(keyword, glossary)).join(', ')
  }
  const value = data[field]
  if (value === undefined) return undefined
  if (field === 'range') return value === 'melee' ? 'Melee' : inches(value as number)
  // A skill no roll can make, as the 7 some flamers carry in place of none, reads as no value VS Data prints.
  if (field === 'skill') return value === null ? 'N/A' : (value as number) > 6 ? undefined : roll(value as number)
  return String(value)
}

/** BSData's spellings of each VS Data wargear name, by `same`, for a datasheet that prints the weapon BSData's way. */
const bsdataSpellings = (() => {
  const found = new Map<string, string[]>()
  for (const [bsdata, vsData] of Object.entries(SPELLINGS))
    for (const spelling of [vsData].flat()) found.set(same(spelling), [...(found.get(same(spelling)) ?? []), same(bsdata)])
  return found
})()

/**
 * Every name a datasheet may print a weapon's profile by: its wargear's, its mode's and the two together, each also with
 * its phase, as a Stikka (melee) beside a Stikka (ranged).
 */
function weaponKeys(wargear: string | undefined, mode: string, modes: number, melee: boolean) {
  const names = wargear ? [wargear, ...(bsdataSpellings.get(wargear) ?? [])] : []
  const own = same(mode)
  const keys = modes > 1 ? [own, ...names.flatMap((name) => (own.startsWith(name) ? [] : [`${name}${own}`]))] : [own, ...names]
  return [...new Set(keys.flatMap((key) => [key, `${key}${melee ? 'melee' : 'ranged'}`]))]
}

const HUNTER = /\s*\(?\s*hunter\s*:[^)]*\)?\s*$/i

/**
 * A printed weapon profile's name as `weaponKeys` writes them: without a leading article, or the reference mark or bracketed ability the
 * catalogue adds, and a Hunter profile's targets read as its Hunter mode.
 */
const printedWeaponKey = (name: string) =>
  same(
    name
      .replace(/^[\s➤]*the\s+/i, '')
      .replace(/\(ref\.? only\)/i, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(HUNTER, ' hunter'),
  ).replace(/(hunter)+$/, 'hunter')

/**
 * The rules version's VS Data stat lines for every datasheet the frozen units map joins to a unit VS Data has, with
 * weapon keywords spelled by `glossary` (`spelledKeyword`). A unit VS Data marks unavailable has none, and so, like their
 * prices, do Warhammer Legends and Crucible datasheets, whose VS Data records do not yet stand for what the catalogue prints.
 */
export function vsProfilesIndex(
  definitions: VsDataDefinitions,
  units: Readonly<Record<string, string>>,
  edition: string | null,
  glossary: readonly string[],
  nameOf: (entryId: string) => string | undefined,
): VsProfilesIndex {
  const named = (kind: 'model' | 'wargear', id: string) => definitions.get(kind, id)?.name
  const lines: VsProfilesIndex['lines'] = {}
  const linesOf = (unit: string): VsProfilesIndex['lines'][string] => {
    const unitLines = definitions.unitProfilesOf(unit).flatMap((profile: Definition<'unit-profile'>) => {
      // A stat line VS Data names no models for among several cannot be placed on a model.
      if (profile.data.gaps?.some((gap) => gap.field === 'models')) return []
      const values: VsStatValues = {}
      for (const [kind, field] of Object.entries(UNIT_FIELDS) as [
        keyof typeof UNIT_FIELDS,
        (typeof UNIT_FIELDS)[keyof typeof UNIT_FIELDS],
      ][]) {
        const value = unitValue(field, profile.data)
        if (value !== undefined) values[kind] = value
      }
      const models = profile.data.models?.flatMap((id) => named('model', id) ?? [])
      return [{ name: profile.name, ...(models ? { models } : {}), values }]
    })
    const weapons = definitions.weaponProfilesOf(unit)
    const modes = new Map<string, number>()
    // A weapon's modes are counted in each phase, so one with a ranged and a melee profile prints its own name in both.
    const phased = (data: WeaponProfileData) => `${data.wargear}|${data.range === 'melee'}`
    for (const { data } of weapons) if (data.wargear) modes.set(phased(data), (modes.get(phased(data)) ?? 0) + 1)
    const weaponLines = weapons.map(({ name, data }): WeaponLine => {
      const values: VsStatValues = {}
      for (const kind of Object.keys(WEAPON_FIELDS) as (keyof typeof WEAPON_FIELDS)[]) {
        const value = weaponValue(kind, data, glossary)
        if (value !== undefined) values[kind] = value
      }
      const wargear = data.wargear ? named('wargear', data.wargear) : undefined
      return {
        keys: weaponKeys(wargear && same(wargear), name, data.wargear ? (modes.get(phased(data)) ?? 1) : 1, data.range === 'melee'),
        melee: data.range === 'melee',
        values,
      }
    })
    return {
      models: definitions.modelsOf(unit).map((model) => model.name),
      unit: unitLines,
      weapons: weaponLines,
    }
  }
  const joined: VsProfilesIndex['units'] = {}
  for (const [entryId, unit] of idsIn(units, edition)) {
    const definition = definitions.get('unit', unit)
    const name = nameOf(datasheetOf(entryId))
    const found =
      definition && name && !definitions.unavailable.has(unit) && !definition.data.legends && !nonMatchedPlayKind(name)
        ? (lines[unit] ?? linesOf(unit))
        : undefined
    if (found && (found.unit.length || found.weapons.length)) {
      joined[entryId] = unit
      lines[unit] = found
    } else if (entryId.includes('/')) joined[entryId] = null
  }
  return { units: joined, lines }
}

const sameValues = (lines: readonly { values: VsStatValues }[]) =>
  lines.length > 0 && lines.every((line) => JSON.stringify(line.values) === JSON.stringify(lines[0]!.values))

/** A datasheet profile as the catalogue prints it, by characteristic kind. */
export type PrintedProfile = { name: string; type: string; values: Partial<Record<DatasheetCharacteristicKind, string>> }

/** The one VS Data line a profile names, before the datasheet's other profiles are weighed. */
function candidateOf(
  lines: VsProfilesIndex['lines'][string],
  datasheetName: string,
  profile: PrintedProfile,
  claimed: ReadonlySet<UnitLine>,
): UnitLine | WeaponLine | null {
  if (profile.type === 'Unit') {
    const alike = lines.unit.filter((line) => same(line.name) === same(profile.name))
    if (alike.length) return sameValues(alike) ? alike[0]! : null
    // A model's line another profile is named for is that profile's, never one the carrier rule reaches by shared words.
    const own = lines.unit.filter((line) => !claimed.has(line))
    const models = modelsNamed(
      lines.models.map((name) => ({ id: name, name })),
      words(datasheetName),
      profile.name,
    )
    // A line for every model fits a profile naming one of them or the datasheet, never a model VS Data does not have.
    if (own.length === 1 && !own[0]!.models) return models?.length || same(profile.name) === same(datasheetName) ? own[0]! : null
    const holding = models?.length ? own.filter((line) => models.every((model) => line.models?.includes(model))) : []
    return sameValues(holding) ? holding[0]! : null
  }
  const melee = profile.type === 'Melee Weapons'
  if (!melee && profile.type !== 'Ranged Weapons') return null
  const key = printedWeaponKey(profile.name)
  const found = lines.weapons.filter((line) => line.melee === melee && line.keys.includes(key))
  return sameValues(found) ? found[0]! : null
}

/**
 * The VS Data stat line each of a datasheet's profiles stands for, or null where VS Data has none for its datasheet or
 * the profile names no single one: a model's by its name, else by the models the carrier rule reads it as
 * (`modelsNamed`), and a weapon's by any name `weaponKeys` gives it in the same phase; candidates printing the same
 * values are one answer. Profiles the catalogue prints differently that would take one line, as a Terminator with a storm
 * shield beside one without, keep the catalogue's, since VS Data tells them apart elsewhere than in its stat lines.
 */
export function vsStatLinesOf(
  index: VsProfilesIndex | undefined,
  catalogueId: string,
  entryId: string,
  datasheetName: string,
  profiles: readonly PrintedProfile[],
): (VsStatValues | null)[] {
  const unit = inBook(index?.units, catalogueId, entryId)
  const lines = unit ? index?.lines[unit] : undefined
  if (!lines) return profiles.map(() => null)
  const claimed = new Set(
    profiles.flatMap((profile) =>
      profile.type === 'Unit' ? lines.unit.filter((line) => line.models && same(line.name) === same(profile.name)) : [],
    ),
  )
  const found = profiles.map((profile) => candidateOf(lines, datasheetName, profile, claimed))
  const printed = (at: number, line: { values: VsStatValues }) =>
    JSON.stringify(Object.keys(line.values).map((kind) => profiles[at]!.values[kind as DatasheetCharacteristicKind] ?? null))
  return found.map((line, at) => {
    if (!line) return null
    const sharing = found.flatMap((other, step) => (other === line ? [step] : []))
    return sharing.every((step) => printed(step, line) === printed(at, line)) ? line.values : null
  })
}
