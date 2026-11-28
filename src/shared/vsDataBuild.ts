import type { BattleSize } from '../core/battleFormat'
import { remember } from '../core/collections'
import { buildUnit, type BuiltUnit, buildVsUnit, type RosterPick } from '../core/roster'
import { type ChoiceOptions, vsUnitChoices, vsUnitToggles } from '../core/unitChoices'
import { type VsDataDefinitions, vsDataDefinitions } from '../core/vsDataConstruction'
import { steppedSizes } from '../core/vsDataBuild'
import { countedKeywordsOf, priceVsRoster, type VsRoster } from '../core/vsDataRoster'
import { vsPickIn } from '../core/vsPickUpgrade'
import type { LoadedCatalogue } from './catalogueIndex'
import { inBook } from './vsDataPoints'
import { vsShellIn, vsShellSpreads } from './vsDataShell'
import { keywordName } from '../core/text'

const definitionsOf = new WeakMap<LoadedCatalogue, VsDataDefinitions | null>()

/** The current rules version's VS Data roster definitions, options and wargear included; null where VS Data checks none. */
export const vsDefinitionsOf = (loaded: LoadedCatalogue): VsDataDefinitions | null =>
  remember(definitionsOf, loaded, () => (loaded.vsRoster ? vsDataDefinitions(loaded.vsRoster.construction) : null))

/** The battle sizes the loaded rules version records, which a list's format rules read. */
export const battleSizesOf = (loaded: LoadedCatalogue): BattleSize[] =>
  vsDefinitionsOf(loaded)
    ?.all('battle-size')
    .map((size) => size.data) ?? []

/** The VS Data unit a datasheet entry is in a list of `catalogueId`, where VS Data defines it in the current rules version and checks it. */
export function vsUnitIdOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string): string | undefined {
  const id = inBook(loaded.vsRoster?.units, catalogueId, entryId)
  const definitions = vsDefinitionsOf(loaded)
  return id && definitions?.get('unit', id) && !definitions.unavailable.has(id) && definitions.modelsOf(id).length ? id : undefined
}

/** The VS Data IDs a list of `catalogueId` with `detachmentIds` reads as, the IDs VS Data does not know left out. */
function vsListOf(loaded: LoadedCatalogue, catalogueId: string, detachmentIds: readonly string[]) {
  const data = loaded.vsRoster
  return {
    faction: data?.books[catalogueId.slice(catalogueId.indexOf('~') + 1)],
    detachments: detachmentIds.flatMap((id) => data?.detachments[id] ?? []),
  }
}

/**
 * One pick built the way its roster builds it: a VS pick by VS Data's definitions beside the catalogue's tree of it
 * (`buildVsUnit`), any other pick, and a VS pick of a datasheet VS Data does not define here, by the catalogue alone.
 */
export function buildPick(
  loaded: LoadedCatalogue,
  pick: RosterPick,
  list: { catalogueId: string; detachmentIds: readonly string[] },
  context: ChoiceOptions,
): BuiltUnit | null {
  const own = builtVsPick(loaded, pick, list, context)
  if (own !== undefined) return own
  // One this version no longer holds is read in the rules version it was saved in, where that version still holds it.
  const saved = pick.vs && pick.rulesVersion ? savedVersionOf(loaded, pick.rulesVersion) : null
  const kept = saved ? builtVsPick(saved, pick, list, context) : undefined
  if (kept?.vs) return { ...kept, vs: { ...kept.vs, rulesVersion: pick.rulesVersion! } }
  const build = (models: number | undefined) =>
    buildUnit(pick.entryId, loaded.index, models, pick.choices, {
      ...context,
      spreads: pick.spreads,
      toggles: pick.toggles,
      floor: pick.floor,
    })
  const plain = build(pick.models)
  // BSData can size a unit by ranges whose sum spans sizes VS Data never fields, as 1-2 Nobz and 9-18 Boyz reach 15.
  const sizes = vsSizesOf(loaded, list.catalogueId, pick.entryId)
  if (!plain || !sizes || plain.size.options || plain.size.min > sizes[0]! || plain.size.max < sizes.at(-1)!) return plain
  const wanted = plain.size.models
  const nearest = sizes.reduce((best, size) => (Math.abs(size - wanted) < Math.abs(best - wanted) ? size : best))
  const built = nearest === wanted ? plain : (build(nearest) ?? plain)
  return { ...built, size: { ...built.size, min: sizes[0]!, max: sizes.at(-1)!, options: sizes } }
}

const savedVersions = new WeakMap<LoadedCatalogue, Map<string, LoadedCatalogue | null>>()

/**
 * The catalogue as it reads VS Data in another rules version: its own catalogue tree, with that version's roster
 * definitions and points (`vsRosterIn`); none where the host gives no such lookup or holds no release for it.
 */
export function savedVersionOf(loaded: LoadedCatalogue, rulesVersion: string): LoadedCatalogue | null {
  const versions = savedVersions.get(loaded) ?? new Map<string, LoadedCatalogue | null>()
  savedVersions.set(loaded, versions)
  if (!versions.has(rulesVersion)) {
    const vsRoster = loaded.vsRosterIn?.(rulesVersion)
    versions.set(rulesVersion, vsRoster ? { ...loaded, vsRoster } : null)
  }
  return versions.get(rulesVersion)!
}

/**
 * A VS pick built by `loaded`'s VS Data beside the catalogue's tree of it (`buildVsUnit`); null where the tree cannot be
 * built, and undefined where this VS Data does not hold the pick, as a pick moved from another rules version or datasheet.
 */
function builtVsPick(
  loaded: LoadedCatalogue,
  pick: RosterPick,
  list: { catalogueId: string; detachmentIds: readonly string[] },
  context: ChoiceOptions,
): BuiltUnit | null | undefined {
  const unit = pick.vs && vsUnitIdOf(loaded, list.catalogueId, pick.entryId)
  const definitions = unit ? vsDefinitionsOf(loaded) : null
  const vs = pick.vs && definitions && unit ? vsPickIn(definitions, unit, pick.vs) : undefined
  if (vs && definitions && unit) {
    const { faction, detachments } = vsListOf(loaded, list.catalogueId, list.detachmentIds)
    const filed = Object.entries(loaded.vsRoster?.enhancements ?? {}).find(
      ([key, id]) => id === vs.enhancement && detachments.includes(key.slice(0, key.indexOf('/'))),
    )
    // The catalogue tree follows the pick's VS Data choices where the options map files each under a catalogue option, so
    // the abilities, characteristics and keywords read from it are the loadout's, not the default's.
    const spreads = vsShellSpreads(vsShellIn(loaded.vsRoster, pick.entryId), vs.options)
    const built = buildVsUnit(
      { ...pick, vs, ...(spreads ? { choices: {}, spreads } : {}) },
      loaded.index,
      {
        definitions,
        unit,
        ...(filed ? { enhancementOption: filed[0].slice(filed[0].indexOf('/') + 1) } : {}),
      },
      context,
    )
    if (!built?.vs) return built
    // The player edits what VS Data offers the pick, so its choices and Warlord are VS Data's, not the catalogue tree's.
    const roster = { roster: { faction: faction ?? '', detachments } }
    // VS Data has no fact yet for a datasheet that must be the Warlord, as Angron must; the catalogue's tree does.
    const required = built.toggles.some((toggle) => toggle.name === 'Warlord' && toggle.required)
    return {
      ...built,
      choices: vsUnitChoices(definitions, built.vs.unit, roster),
      toggles: vsUnitToggles(definitions, built.vs.unit, roster).map((toggle) => (required ? { ...toggle, required } : toggle)),
    }
  }
  return undefined
}

/** The sizes VS Data steps a datasheet's unit between, where it fields some but not all between its smallest and largest. */
function vsSizesOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string): number[] | undefined {
  const unit = vsUnitIdOf(loaded, catalogueId, entryId)
  return unit ? steppedSizes(vsDefinitionsOf(loaded)!.get('unit', unit)!.data.sizes) : undefined
}

/** The list as VS Data's roster reads it, its VS picks fielded by their own selections and every other unit by its ID. */
function vsRosterOf(
  loaded: LoadedCatalogue,
  definitions: VsDataDefinitions,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
) {
  const { faction, detachments } = vsListOf(loaded, list.catalogueId, list.detachmentIds)
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === list.limit)?.id
  // Where each unit sits in the VS roster; a unit VS Data does not know has no place, though it still counts in the list.
  const at = new Map<number, number>()
  const read: VsRoster['units'] = []
  units.forEach((unit, position) => {
    const id = unit.vs?.unit.unit ?? inBook(loaded.vsRoster?.units, list.catalogueId, unit.entryId)
    if (!id) return
    at.set(position, read.length)
    read.push(unit.vs?.unit ?? { unit: id })
  })
  const roster: VsRoster = { faction: faction ?? '', detachments, ...(battleSize ? { battleSize } : {}), units: read }
  return { roster, at }
}

/**
 * What each VS pick costs under VS Data's points, by its position in `units`, copies of a datasheet counted across the
 * whole list as the field manual counts them. A pick VS Data leaves any part of unpriced has no price here.
 */
export function vsPickPrices(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
): Map<number, number> {
  // A pick read in its saved rules version is priced there, among that version's picks; here it counts as its datasheet.
  const prices = pricesIn(
    loaded,
    list,
    units.map((unit) => (unit.vs?.rulesVersion ? { entryId: unit.entryId } : unit)),
  )
  for (const rulesVersion of new Set(units.flatMap((unit) => unit.vs?.rulesVersion ?? []))) {
    const saved = savedVersionOf(loaded, rulesVersion)
    const own = units.map((unit) => (unit.vs?.rulesVersion === rulesVersion ? unit : { entryId: '' }))
    if (saved) for (const [position, points] of pricesIn(saved, list, own)) prices.set(position, points)
  }
  return prices
}

function pricesIn(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
): Map<number, number> {
  const definitions = units.some((unit) => unit.vs) ? vsDefinitionsOf(loaded) : null
  if (!definitions) return new Map()
  const { roster, at } = vsRosterOf(loaded, definitions, list, units)
  const price = priceVsRoster(definitions, roster)
  return new Map(
    units.flatMap((unit, position) => {
      const place = at.get(position)
      const priced = place === undefined ? undefined : price.units[place]
      return unit.vs && priced && !priced.unpriced.length ? [[position, priced.points] as const] : []
    }),
  )
}

/**
 * A VS pick's keywords in its list: its datasheet's, each conditional one the list or its allegiance gives it, and those of
 * each model it fields, since a unit has all its models' keywords, as a squad led by a Character is one.
 */
export function vsPickKeywords(
  loaded: LoadedCatalogue,
  list: { catalogueId: string; detachmentIds: readonly string[]; limit: number },
  units: readonly { entryId: string; vs?: BuiltUnit['vs'] }[],
  position: number,
): string[] | null {
  const definitions = vsDefinitionsOf(loaded)
  const built = units[position]?.vs
  if (!definitions || !built || !definitions.get('unit', built.unit.unit)) return null
  return countedKeywordsOf(definitions, vsRosterOf(loaded, definitions, list, units).roster, built.unit).map(keywordName)
}
