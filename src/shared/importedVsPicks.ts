import { remember } from '../core/collections'
import { catalogueEditionId } from '../core/catalogueEdition'
import { type LegacyOptions, legacyOptionSelections } from '../core/legacyIds'
import { buildUnit, type RosterPick, type VsPick } from '../core/roster'
import { hasWarlordToggle } from '../core/unitChoices'
import type { VsDataDefinitions } from '../core/vsDataConstruction'
import { vsUnitProblems } from '../core/vsDataUnit'
import { wargearKey } from '../core/wargearNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { calculateRosterPrice } from './pricing'
import { vsDefinitionsOf, vsUnitIdOf } from './vsDataBuild'
import { same } from './vsDataModelNames'
import { isVsNative } from './vsDataPicks'
import { inBook } from './vsDataPoints'
import { ARTICLE, vsKnownWargear, vsSpelling } from './wargearSpellings'

/** The frozen per-choice map and the allegiance each datasheet implies (`units.json`), which turn a BSData pick into VS Data's. */
export type ImportVsMaps = { options: LegacyOptions; allegiances: Readonly<Record<string, string>> }

type Price = NonNullable<ReturnType<typeof calculateRosterPrice>>
type PricedUnit = Price['units'][number]
type List = { catalogueId: string; detachmentIds: readonly string[] }

const knownOf = new WeakMap<VsDataDefinitions, Map<string, ReadonlySet<string>>>()

/**
 * A priced unit's wargear as VS Data spells it, through the reviewed spellings against its VS Data unit's own wargear
 * for a catalogue pick, without its allegiance: what stays the same when a unit moves onto VS Data.
 */
export function vsSpelledWargear(
  loaded: LoadedCatalogue,
  catalogueId: string,
  unit: PricedUnit,
  pick: RosterPick,
  allegiance: string | null | undefined,
) {
  const definitions = vsDefinitionsOf(loaded)
  const id = vsUnitIdOf(loaded, catalogueId, unit.entryId)
  const known =
    definitions && id
      ? remember(
          remember(knownOf, definitions, () => new Map()),
          id,
          () => vsKnownWargear(definitions, id),
        )
      : new Set<string>()
  const named = allegiance && same(definitions?.get('allegiance', allegiance)?.name ?? allegiance)
  const wargear = new Map<string, number>()
  for (const piece of unit.wargear) {
    // An allegiance is no wargear, though a VS pick's roster line names it beside its wargear, as BSData names a mark.
    if (named && same(piece.name).endsWith(named)) continue
    const key = pick.vs ? wargearKey(piece.name).replace(ARTICLE, '') : vsSpelling(piece.name, known)
    wargear.set(key, (wargear.get(key) ?? 0) + piece.count)
  }
  return [...wargear].map(([key, count]) => `${count}x ${key}`).toSorted()
}

/** How many models of each kind the priced unit fields, by `same` name. */
function kindsOf(unit: PricedUnit) {
  const countOf = (choiceKey: string, optionId: string) =>
    unit.choices.find((choice) => choice.key === choiceKey)?.options.find((option) => option.id === optionId)?.count ?? 0
  const kinds = new Map<string, number>()
  for (const kind of unit.models) {
    const n = kind.members.reduce(
      (total, member) => total + (member.choiceKey ? countOf(member.choiceKey, member.id) : member.baseCount),
      0,
    )
    if (n > 0) kinds.set(same(kind.name), (kinds.get(same(kind.name)) ?? 0) + n)
  }
  return kinds
}

/** VS Data's model counts for a unit of `total` models: by name where they tell, else its fixed models and its one variable model. */
export function vsModels(definitions: VsDataDefinitions, unit: string, named: ReadonlyMap<string, number>, total: number) {
  const models = definitions.modelsOf(unit)
  const byName = new Map(models.map((model) => [same(model.name), model]))
  const counts: Record<string, number> = Object.fromEntries(models.map((model) => [model.id, 0]))
  let matched = 0
  for (const [name, count] of named) {
    const model = byName.get(name)
    if (!model) continue
    counts[model.id] = (counts[model.id] ?? 0) + count
    matched += count
  }
  if (matched === total) return counts
  const bounds = models.map((model) => ({ id: model.id, ...(model.data.bySize?.find((row) => row.size === total) ?? model.data) }))
  const variable = bounds.filter(({ min, max }) => min !== max)
  const fixed = bounds.filter(({ min, max }) => min === max).reduce((sum, { min }) => sum + min, 0)
  if (variable.length > 1) return null
  return Object.fromEntries(bounds.map((model) => [model.id, model === variable[0] ? total - fixed : model.min]))
}

/** The model that holds a VS pick's Warlord: the unit's Character model, else its one model of a kind, as VS Data's checker reads it. */
function vsWarlordModel(definitions: VsDataDefinitions, unit: string) {
  const kinds = definitions.modelsOf(unit)
  return (
    kinds.find((model) => model.data.keywords?.some((keyword) => keyword.toUpperCase() === 'CHARACTER')) ??
    kinds.find((model) => model.data.max === 1) ??
    kinds[0]
  )?.id
}

/** The Warlord model of a VS pick of `entryId` in a list of `catalogueId`. */
export function vsWarlordOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const definitions = vsDefinitionsOf(loaded)
  const unit = vsUnitIdOf(loaded, catalogueId, entryId)
  return definitions && unit ? vsWarlordModel(definitions, unit) : undefined
}

/**
 * A catalogue pick of a datasheet the builder adds by VS Data, read through the frozen maps, with the catalogue choices
 * that arm its tree less its Enhancement, which `vs` holds; undefined where the maps can't read it.
 */
function translated<T extends RosterPick>(
  loaded: LoadedCatalogue,
  definitions: VsDataDefinitions,
  maps: ImportVsMaps,
  list: List,
  pick: T,
  unit: PricedUnit,
): T | undefined {
  const id = vsUnitIdOf(loaded, list.catalogueId, pick.entryId)
  const entry = id && isVsNative(id) ? inBook(maps.options, list.catalogueId, pick.entryId) : undefined
  if (!id || !entry || entry.unit !== id) return undefined
  const first = buildUnit(pick.entryId, loaded.index)
  // An Enhancement or upgrade is read through the Enhancement map below, never the per-choice map.
  const special = new Set(unit.choices.flatMap((choice) => (choice.kind ? [choice.key] : [])))
  const choices = pick.choices && Object.fromEntries(Object.entries(pick.choices).filter(([key]) => !special.has(key)))
  const read = legacyOptionSelections(
    entry,
    { ...pick, choices },
    (key, option) => first?.choices.find((choice) => choice.key === key)?.options.find((held) => held.id === option)?.count ?? 0,
  )
  const models = read && vsModels(definitions, id, kindsOf(unit), unit.size.models)
  if (!read || !models) return undefined
  const options: VsPick['options'] = {}
  for (const part of [definitions.get('unit', id)!.data.defaults ?? {}, read.selections])
    for (const [option, chosen] of Object.entries(part))
      for (const [wargear, n] of Object.entries(chosen)) (options[option] ??= {})[wargear] = (options[option]?.[wargear] ?? 0) + n
  for (const [option, chosen] of Object.entries(options)) {
    for (const [wargear, n] of Object.entries(chosen)) if (!n) delete chosen[wargear]
    if (!Object.keys(chosen).length) delete options[option]
  }
  if (vsUnitProblems(definitions, { unit: id, models, options }).length) return undefined
  // Each Enhancement or upgrade the unit holds is the one VS Data files under the list's Detachments; an option two of
  // them file apart is no one Enhancement, as pricing reads it.
  const detachments = list.detachmentIds.flatMap((detachment) => loaded.vsRoster?.detachments[detachment] ?? [])
  const specials = unit.choices.flatMap((choice) =>
    choice.kind
      ? choice.options
          .filter((option) => option.count > 0)
          .map((option) => {
            const filed = new Set(detachments.flatMap((detachment) => loaded.vsRoster?.enhancements[`${detachment}/${option.id}`] ?? []))
            return filed.size === 1 ? [...filed][0] : undefined
          })
      : [],
  )
  if (specials.length > 1 || specials.some((found) => !found)) return undefined
  const allegiance = read.allegiance ?? inBook(maps.allegiances, list.catalogueId, pick.entryId)
  const warlord = hasWarlordToggle(unit.toggles) ? vsWarlordModel(definitions, id) : undefined
  const vs: VsPick = {
    models,
    options,
    ...(specials[0] ? { enhancement: specials[0] } : {}),
    ...(allegiance ? { allegiance } : {}),
    ...(warlord ? { warlord } : {}),
  }
  const { choices: _choices, ...rest } = pick
  return { ...rest, ...(choices && Object.keys(choices).length ? { choices } : {}), vs } as T
}

const facts = (loaded: LoadedCatalogue, list: List, unit: PricedUnit | undefined, pick: RosterPick, allegiance: string | undefined) =>
  unit &&
  JSON.stringify([
    unit.points,
    unit.size.models,
    unit.enhancements.length + unit.upgrades.length,
    vsSpelledWargear(loaded, list.catalogueId, unit, pick, allegiance),
  ])

/**
 * An import's picks as the builder would add them: each of a datasheet it adds by VS Data (`isVsNative`) on the current
 * rules version as a VS pick, read through the frozen per-choice map, where VS Data's checker accepts it and it prices
 * to the same points, models, Enhancement and wargear as the catalogue pick; any other stays as the catalogue reads it.
 * The picks themselves come back where none comes in as a VS pick.
 */
export function withImportedVsPicks<T extends RosterPick>(
  picks: (T & { vs?: VsPick })[],
  list: List,
  loaded: LoadedCatalogue,
  maps: ImportVsMaps,
  priced: Price,
  price: (units: readonly RosterPick[]) => Price | null,
): (T & { vs?: VsPick })[] {
  const definitions = vsDefinitionsOf(loaded)
  if (!definitions || catalogueEditionId(list.catalogueId)) return picks
  const built = new Map(priced.units.map((unit) => [unit.key, unit]))
  let next: (T & { vs?: VsPick })[] = picks.map((pick, key) => {
    const unit = built.get(key)
    return (!pick.vs && unit && translated(loaded, definitions, maps, list, pick, unit)) || pick
  })
  // Copies count across the whole list, so a unit is kept as VS Data prices it beside the others it was read with.
  for (let round = 0; round < 3; round++) {
    if (next.every((pick, key) => pick === picks[key])) return picks
    const vsPriced = new Map(price(next)?.units.map((unit) => [unit.key, unit]))
    const kept = next.map((pick, key) =>
      pick === picks[key] ||
      facts(loaded, list, vsPriced.get(key), pick, pick.vs?.allegiance) ===
        facts(loaded, list, built.get(key), picks[key]!, pick.vs?.allegiance)
        ? pick
        : picks[key]!,
    )
    if (kept.every((pick, key) => pick === next[key])) return next
    next = kept
  }
  return picks
}
