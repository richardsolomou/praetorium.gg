import { z } from 'zod'

/**
 * What list building and datasheets read from one rules version's VS Data release: every roster definition and datasheet
 * profile by kind and ID, with its name, the Enhancements by their rule facts, the units it marks absent or retired and
 * their replacements, and the points snapshots. Kept beside
 * the release's summaries as `summaries/<rules version>.construction.json`.
 */
export const vsDataConstructionSchema = z.object({
  release: z.string(),
  rulesVersion: z.object({ edition: z.string(), update: z.string() }),
  definitions: z.record(z.string(), z.record(z.string(), z.object({ name: z.string(), data: z.record(z.string(), z.unknown()) }))),
  /** Units the rules version does not have, though other sources name them: no roster may hold them. */
  unavailable: z.array(z.string()).default([]),
  /** The one unit each retired unit is replaced by, where it names one, which a list holding the retired unit reads as. */
  replacements: z.record(z.string(), z.string()).optional(),
  points: z.array(z.record(z.string(), z.unknown())),
})
export type VsDataConstruction = z.infer<typeof vsDataConstructionSchema>

// The shapes below mirror VS Data's definitions.v2.schema.json and points.v1.schema.json, which the release's own
// verification has checked by the time a construction file is written.

/** How many of each wargear ID. */
export type Counts = Record<string, number>
/** Holds for a roster of `faction`, with `detachment`, whose units name `warlord`; `allegiance` only for the unit that took it. */
export type When = { faction?: string; detachment?: string; warlord?: string; allegiance?: string }
type RosterBounds = { min?: number; max?: number }
export type UnitLimit = RosterBounds & { keywords: string[]; detachments?: (RosterBounds & { detachment: string })[] }
export type AllyLimit = { keywords: string[]; battleSize: string; max: number; free?: { keywords: string[]; per: string[] }[] }
export type Ally = {
  units: string[]
  detachments?: string[]
  points?: { battleSize: string; max: number }[]
  limits?: AllyLimit[]
  oneLimit?: true
  enhancements?: true
}
/**
 * `excludedDetachments` are its parent's Detachments its rosters may not take. With `withoutDetachments`, its rosters take
 * none, their Warlord is one of its `warlords`, and `dispositions` are their force dispositions.
 */
export type FactionData = {
  unitLimits?: UnitLimit[]
  parent?: string
  excludedUnits?: string[]
  excludedDetachments?: string[]
  withoutDetachments?: { warlords: string[]; dispositions?: string[] }
  allies?: Ally[]
}
export type BattleSizeData = { points: number; detachmentPoints?: number; enhancements?: number; duplicates?: number }
export type DetachmentData = {
  faction: string
  enhancements?: string[]
  dispositions?: string[]
  excludedUnits?: string[]
  warlords?: string[]
  requiredWarlords?: string[]
  group?: string
  allegianceLimits?: (RosterBounds & { allegiances: string[] })[]
  /** While the roster holds it, a unit holding every one of `keywords` takes only this Detachment's Enhancements. */
  exclusiveEnhancements?: { keywords: string[] }
}
export type AllegianceOffer = { choices: string[]; required?: true; detachment?: string; requires?: Record<string, string> }
export type Limit = { battleSize: string; perRoster: number; when?: When }
export type Bounds = { min: number; max: number }
type SizeBounds = Bounds & { size: number }
type SizeMaximum = { size: number; max: number }
type ModelCountBounds = Bounds & { bySize?: SizeBounds[] }
/** Scales a bound by each carrier model, or by every `models` models in the unit; absent means once per unit. */
export type Per = 'carrier' | { models: number }
export type OptionGroup = {
  options: { option: string; choices?: string[]; weight?: number }[]
  min?: number
  max: number
  carrier?: string
  per?: Per
  bySize?: SizeMaximum[]
}
export type UnitData = {
  faction: string
  keywords: string[]
  conditionalKeywords?: { keywords: string[]; when: When }[]
  sizes: number[]
  compositions?: Record<string, Bounds>[]
  modelGroups?: (ModelCountBounds & { models: string[] })[]
  optionGroups?: OptionGroup[]
  perRoster?: number
  limits?: Limit[]
  legends?: true
  enhancements?: false
  allegiances?: AllegianceOffer[]
  wargear?: Counts
  defaults?: Record<string, Counts>
  defaultModels?: Record<string, number>
}
/** `keywords` are those the model has beyond its unit's, as when a squad's leader is a Character. */
/** `warlord: false` keeps the model from the Warlord role unless a Detachment's or the faction's `warlords` grants it. */
export type ModelData = ModelCountBounds & { unit: string; wargear: Counts; keywords?: string[]; warlord?: false }
export type Requirement = { option: string; choices: string[] }
export type OptionData = {
  unit: string
  carrier?: string
  choose: Bounds
  per?: Per
  bySize?: SizeBounds[]
  uniform?: true
  substitutes?: string[]
  replaces?: Counts
  choices: string[]
  caps?: { choices: string[]; max: number; per?: Per; bySize?: SizeMaximum[] }[]
  requires?: Requirement | Requirement[]
}
export type WargearData = { includes?: Counts }

// The profile shapes mirror VS Data's profiles.v1.schema.json: a field a gap names is left out, never guessed.
/** A field VS Data leaves out, and why: `unrepresentable`, `no-source` or `no-target`. */
export type Gap = { field: string; reason: string }
export type InvulnerableSave = { roll: number; against?: 'ranged' | 'melee'; conditional?: true; summary?: string }
/** One stat line: of `models`, or of every model of `unit` without them. */
export type UnitProfileData = {
  unit: string
  models?: string[]
  movement?: number | { atLeast: number } | null
  toughness?: number
  save?: number
  wounds?: number
  leadership?: number
  objectiveControl?: number | null
  invulnerableSave?: InvulnerableSave | InvulnerableSave[]
  baseSize?: unknown
  gaps?: Gap[]
}
/** One mode of a weapon as `unit`'s datasheet prints it; a weapon of several modes has one per mode, each naming its `wargear`. */
export type WeaponProfileData = {
  unit: string
  wargear?: string
  range?: number | 'melee'
  attacks?: number | string
  skill?: number | null
  strength?: number
  armourPenetration?: number
  damage?: number | string
  keywords?: string[]
  gaps?: Gap[]
}
export type ConditionalAttachment = {
  role: 'leads' | 'supports'
  units?: string[]
  keywords?: string[]
  when?: { faction?: string; detachment?: string; withoutDetachment?: string; withUnit?: string; withoutUnit?: string }
  shared?: string
}
/** The units `unit` may join as a Leader or a support attachment, in any roster or only under `conditional`. */
export type AttachmentData = { unit: string; leads?: string[]; supports?: string[]; conditional?: ConditionalAttachment[]; gaps?: Gap[] }
export type TransportProfileData = { unit: string; capacity?: Record<string, unknown>; firingDeck?: number; gaps?: Gap[] }
/**
 * Who may take an Enhancement, from its rule facts (VS Data's `docs/rule-facts.md`): a bearer matching one of `anyOf`
 * and none of `excludedKeywords`, carrying `requiredWargear`, a CHARACTER unless `nonCharacters`, not an EPIC HERO unless
 * `epicHeroes`, and not the Warlord when `notWarlord`.
 */
export type EnhancementData = {
  detachment: string
  type: 'model' | 'unit' | 'upgrade'
  perRoster?: number
  outsideLimit?: true
  eligibility: {
    anyOf: { keywords?: string[]; factionKeywords?: string[]; unit?: { id: string } }[]
    excludedKeywords?: string[]
    requiredWargear?: string[]
    epicHeroes?: true
    nonCharacters?: true
    notWarlord?: true
  }
}

type DataOf = {
  faction: FactionData
  'battle-size': BattleSizeData
  detachment: DetachmentData
  enhancement: EnhancementData
  unit: UnitData
  model: ModelData
  'roster-option': OptionData
  wargear: WargearData
  allegiance: Record<string, never>
  'unit-profile': UnitProfileData
  'weapon-profile': WeaponProfileData
  attachment: AttachmentData
  'transport-profile': TransportProfileData
}
export type DefinitionKind = keyof DataOf
export type Definition<K extends DefinitionKind = DefinitionKind> = { id: string; name: string; data: DataOf[K] }

type OrUnresolved<T> = T | { unresolved: string }
export type PointsCost = { models: number; composition?: string; points: OrUnresolved<number> }
export type PointsUnit = {
  id: string
  name: string
  legends?: true
  tiers: { copies: { from: number; to?: number }; costs: PointsCost[] }[]
  wargear?: { item: string; points: OrUnresolved<number> }[]
}
export type PointsSnapshot = {
  id: string
  factions: {
    id: string
    detachments: { id: string; dp: OrUnresolved<number>; enhancements: { id: string; upgrade?: true; points: OrUnresolved<number> }[] }[]
    units: PointsUnit[]
  }[]
}

/** One rules version's roster definitions and profiles, by kind and ID, with every unit's models, options and stat lines in ID order. */
export type VsDataDefinitions = {
  release: string
  get<K extends DefinitionKind>(kind: K, id: string): Definition<K> | undefined
  all<K extends DefinitionKind>(kind: K): Definition<K>[]
  modelsOf(unit: string): Definition<'model'>[]
  optionsOf(unit: string): Definition<'roster-option'>[]
  unitProfilesOf(unit: string): Definition<'unit-profile'>[]
  weaponProfilesOf(unit: string): Definition<'weapon-profile'>[]
  /** Units the rules version does not have, though other sources name them. */
  unavailable: ReadonlySet<string>
  /** The unit a saved ID reads as: the one its retirement names as its replacement, else itself. */
  current(unit: string): string
  /** The points snapshots, the current update first and its Legends companion after it. */
  points: PointsSnapshot[]
}

export function vsDataDefinitions(construction: VsDataConstruction): VsDataDefinitions {
  const byKind = new Map(
    Object.entries(construction.definitions).map(([kind, records]) => [
      kind,
      new Map(Object.entries(records).map(([id, record]) => [id, { id, name: record.name, data: record.data }])),
    ]),
  )
  const ofUnit = (kind: 'model' | 'roster-option' | 'unit-profile' | 'weapon-profile') => {
    const found = new Map<string, Definition[]>()
    for (const definition of [...(byKind.get(kind)?.values() ?? [])].toSorted((left, right) => (left.id < right.id ? -1 : 1))) {
      const unit = definition.data.unit as string
      found.set(unit, [...(found.get(unit) ?? []), definition])
    }
    return found
  }
  const models = ofUnit('model')
  const options = ofUnit('roster-option')
  const unitProfiles = ofUnit('unit-profile')
  const weaponProfiles = ofUnit('weapon-profile')
  return {
    release: construction.release,
    get: <K extends DefinitionKind>(kind: K, id: string) => byKind.get(kind)?.get(id) as Definition<K> | undefined,
    all: <K extends DefinitionKind>(kind: K) => [...(byKind.get(kind)?.values() ?? [])] as Definition<K>[],
    modelsOf: (unit) => (models.get(unit) ?? []) as Definition<'model'>[],
    optionsOf: (unit) => (options.get(unit) ?? []) as Definition<'roster-option'>[],
    unitProfilesOf: (unit) => (unitProfiles.get(unit) ?? []) as Definition<'unit-profile'>[],
    weaponProfilesOf: (unit) => (weaponProfiles.get(unit) ?? []) as Definition<'weapon-profile'>[],
    unavailable: new Set(construction.unavailable),
    current: (unit) => construction.replacements?.[unit] ?? unit,
    points: construction.points as PointsSnapshot[],
  }
}
