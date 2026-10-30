import { cachedIn, remember } from '../core/collections'
import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { formatDatasheetLimit, isKotcLimit, kotcDatasheetRepeatable, kotcUnitExclusions } from '../core/battle'
import {
  battleSizeSelection,
  hiddenByRules,
  keywordNames,
  keywordsBySelection,
  type ModifierCache,
  rosterLimit,
  type Selection,
} from '../core/evaluate'
import { defaultSelection } from '../core/expand'
import { isNonMatchedPlayName, nonMatchedPlayKind } from '../core/name'
import type { UnitGroup } from '../core/unitGroups'
import type { UnitSummary } from '../contracts/catalogue'
import { datasheetSearchFieldsIn, datasheetIn, keywordsIn, toughnessOf } from './catalogue'
import { datasheetSlug, datasheetsOf, type LoadedCatalogue } from './catalogueIndex'
import { searchDatasheetEntries } from '../core/datasheetSearch'
import { type FactionRestrictions, restrictedBy } from './datacards'
import { datacardOf } from './datasheetJoin'
import { factionContentOf } from './factionNames'
import { rosterDetachments } from './rosterDetachments'
import { isOfferedDatasheet, listPriceOf, priceOf, seedListPrice } from './catalogueUnit'
import { completeSteps, type Steps, type Stepwise, stepwise } from './steps'

/** Derived from one immutable catalogue snapshot. Search filters this list in memory. */
const unitSummaryCache = new WeakMap<LoadedCatalogue, Map<string, Stepwise<UnitSummary[]>>>()

/** Restriction sets live on the rules snapshot, so identity is a stable cache key. */
const restrictionsKeys = new WeakMap<FactionRestrictions, string>()
let nextRestrictionsKey = 0
function restrictionsKey(restrictions: FactionRestrictions | undefined) {
  return restrictions ? remember(restrictionsKeys, restrictions, () => `r${++nextRestrictionsKey}`) : 'none'
}

const GROUP_BY_CATEGORY = new Map<string, UnitGroup>([
  ['epic hero', 'epic-hero'],
  ['character', 'character'],
  ['battleline', 'battleline'],
  ['infantry', 'infantry'],
  ['swarm', 'swarm'],
  ['mounted', 'mounted'],
  ['beast', 'beast'],
  ['monster', 'monster'],
  ['vehicle', 'vehicle'],
  ['drone', 'drone'],
  ['dedicated transport', 'transport'],
  ['fortification', 'fortification'],
])

/**
 * The primary category is on the datasheet, so a link is read together with what it
 * points at.
 *
 * A datasheet can print more than one, and the first is not always the one a player
 * sorts by: a Reaver Titan prints `Allies: Titanicus Traitoris` ahead of `Vehicle`.
 * So the first that names a shelf wins, and one whose claims are all bookkeeping
 * stays under Other rather than borrowing a shelf from a secondary keyword.
 */
function groupOf(entry: Definition, target: Definition): UnitGroup {
  const categories = [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])]
  for (const link of categories) {
    if (!link.primary) continue
    const shelf = shelfOfCategory(link.name)
    if (shelf) return shelf
  }
  if (entry.id.startsWith('profile-unit-')) {
    const shelves = categories.flatMap((link) => shelfOfCategory(link.name) ?? [])
    return (
      (['epic-hero', 'character', 'battleline', 'transport'] as const).find((shelf) => shelves.includes(shelf)) ?? shelves[0] ?? 'other'
    )
  }
  return 'other'
}

const shelfOfCategory = (name: string | undefined) => GROUP_BY_CATEGORY.get((name ?? '').trim().toLowerCase())

/** The same shelf by entry id, so a roster and the picker cannot sort a unit differently. */
export function groupOfEntry(index: CatalogueIndex, entryId: string): UnitGroup {
  const entry = index.definitions.get(entryId)
  return entry ? groupOf(entry, targetOf(entry, index.definitions)) : 'other'
}

/** The shelf a list's rules move a unit to, as Bridgehead Strike makes Tempestus Scions Battleline, or its datasheet's own. */
export const shelfIn = (index: CatalogueIndex, entryId: string, primaries: readonly string[]): UnitGroup =>
  primaries.map((id) => shelfOfCategory(index.categories.get(id)?.name)).find(Boolean) ?? groupOfEntry(index, entryId)

/** A datasheet's keywords and shelf as one more copy of it in the roster would have them, which its detachments can change. */
function listedUnitFacts(loaded: LoadedCatalogue, catalogueId: string, entryId: string, roster: readonly Selection[]) {
  const selection = defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId })
  if (!selection) return null
  const held = keywordsBySelection([...roster, selection], loaded.index, { primaryCatalogueId: catalogueId }).at(-1)!
  return { keywords: keywordNames(held.keywords, loaded.index), group: shelfIn(loaded.index, entryId, held.primaries) }
}

const detachmentFactsCache = new WeakMap<LoadedCatalogue, Map<string, ReturnType<typeof listedUnitFacts>>>()

/** `listedUnitFacts` for a roster of just its detachments, which is what the picker offers from; null with none chosen. */
export function detachmentUnitFacts(loaded: LoadedCatalogue, catalogueId: string, entryId: string, detachments: readonly Selection[]) {
  if (!detachments.length) return null
  return cachedIn(detachmentFactsCache, loaded, `${JSON.stringify(detachments)}:${catalogueId}:${entryId}`, () =>
    listedUnitFacts(loaded, catalogueId, entryId, detachments),
  )
}

/**
 * The pickable datasheets in a book, with the price of the smallest legal version
 * of each. Points are derived here and never stored: the data revision is what a
 * roster pins, and the number follows from it.
 *
 * Pricing is the same `buildUnit` the roster itself goes through, so a number in
 * the picker cannot disagree with the number the unit costs once added. Every
 * datasheet the book offers is priced: the largest is under two hundred and the
 * whole of it costs a fraction of a second, which is a great deal cheaper than a
 * page that silently ends at the letter I.
 */
export function unitsIn(loaded: LoadedCatalogue, catalogueId: string, query: string, options: UnitListOptions = {}): UnitSummary[] {
  return searchDatasheetEntries(unitSummaries(loaded, catalogueId, options).get(), query.trim().toLowerCase(), (unit) =>
    datasheetSearchFieldsIn(loaded, catalogueId, unit.id),
  )
}

export type UnitListOptions = {
  restrictions?: FactionRestrictions
  factionCards?: boolean
  battleSize?: number
  waivedRules?: readonly string[]
  detachmentIds?: readonly string[]
  /** Also list Legends and Crucible datasheets, as the roster picker does. */
  nonMatchedPlay?: boolean
}

/** A faction page lists what its cards list, where it has cards at all. */
function hasFactionCards(loaded: LoadedCatalogue, catalogueId: string, factionCards = false) {
  const book = loaded.index.catalogues.get(catalogueId)
  return Boolean(factionCards && book && factionContentOf(loaded, book.name))
}

/** The datasheets a book's list holds before pricing, so a count of them matches the list. */
export function listedDatasheets(
  loaded: LoadedCatalogue,
  catalogueId: string,
  { factionCards, nonMatchedPlay = false }: Pick<UnitListOptions, 'factionCards' | 'nonMatchedPlay'> = {},
) {
  const included = hasFactionCards(loaded, catalogueId, factionCards)
  const allied = loaded.index.alliedDatasheets.get(catalogueId)
  return [...datasheetsOf(loaded.index, catalogueId)].flatMap((id) => {
    const entry = loaded.index.definitions.get(id)
    if (!entry || !isOfferedDatasheet(loaded.index, entry, nonMatchedPlay)) return []
    const name = nameOf(entry, loaded.index.definitions)
    // No Game Datacards export prints Legends or Crucible cards, so the faction's cards cannot list them.
    if (included && !isNonMatchedPlayName(name) && !datacardOf(loaded, catalogueId, id)?.own) return []
    // Unaligned Forces is the shared shelf for Legends fortifications and
    // mission-only battlefield assets. A few assets (including Sentry Gun) lack
    // the suffix even though they are not matched-play roster choices.
    if (allied?.get(id)?.name === 'Unaligned Forces' && !isNonMatchedPlayName(name)) return []
    return [{ id, entry, name }]
  })
}

const gatedCache = new WeakMap<LoadedCatalogue, Map<string, Map<string, string[]>>>()

/**
 * The datasheets a book's detachments show or hide, each with the names of the detachments it
 * is offered under, such as the Deathwatch a chapter fields only with Deathwatch Support.
 * Legends and allies are hidden alike under every detachment, so none of them are here.
 */
function detachmentGatedDatasheets(loaded: LoadedCatalogue, catalogueId: string) {
  return cachedIn(gatedCache, loaded, catalogueId, () => {
    const options = { primaryCatalogueId: catalogueId, mustering: true }
    const detachments = (loaded.detachments.get(catalogueId)?.options ?? []).map((option) => ({
      name: option.name,
      roster: rosterDetachments(loaded, catalogueId, [option.id]).selections,
    }))
    const gated = new Map<string, string[]>()
    for (const { id, entry } of listedDatasheets(loaded, catalogueId, { nonMatchedPlay: true })) {
      const shown = detachments.filter(({ roster }) => !hiddenByRules(entry, loaded.index, { ...options, roster }))
      const hidden = hiddenByRules(entry, loaded.index, options)
      if (shown.length !== (hidden ? 0 : detachments.length))
        gated.set(
          id,
          shown.map(({ name }) => name),
        )
    }
    return gated
  })
}

/** The detachments that would offer a datasheet the roster's own detachments hide, or null when they offer it. */
export function detachmentsUnlocking(loaded: LoadedCatalogue, catalogueId: string, entryId: string, roster: readonly Selection[]) {
  const offeredBy = detachmentGatedDatasheets(loaded, catalogueId).get(entryId)
  const entry = loaded.index.definitions.get(entryId)
  if (!offeredBy || !entry) return null
  return hiddenByRules(entry, loaded.index, { primaryCatalogueId: catalogueId, mustering: true, roster }) ? offeredBy : null
}

type ListOptions = {
  restrictions?: FactionRestrictions
  included: boolean
  battleSize?: number
  waivedRules: readonly string[]
  detachments: ReturnType<typeof rosterDetachments>
  nonMatchedPlay: boolean
}

function listOptions(
  loaded: LoadedCatalogue,
  catalogueId: string,
  { restrictions, factionCards, battleSize, waivedRules = [], detachmentIds = [], nonMatchedPlay = false }: UnitListOptions,
): ListOptions {
  const included = hasFactionCards(loaded, catalogueId, factionCards)
  const detachments = rosterDetachments(loaded, catalogueId, detachmentIds)
  return { restrictions, included, battleSize, waivedRules, detachments, nonMatchedPlay }
}

/** The complete priced list `unitsIn` searches, built a datasheet per step and shared by every reader of the same list. */
export function unitSummaries(loaded: LoadedCatalogue, catalogueId: string, options: UnitListOptions = {}): Stepwise<UnitSummary[]> {
  const listed = listOptions(loaded, catalogueId, options)
  return cachedIn(unitSummaryCache, loaded, summaryKey(catalogueId, listed), () =>
    stepwise(() => summarizeUnits(loaded, catalogueId, listed)),
  )
}

/**
 * Supplies what `unitSummaries` would build for `options` from a list built earlier from the same snapshot, and the
 * list prices in it, unless a reader built them first.
 */
export function seedUnitSummaries(loaded: LoadedCatalogue, catalogueId: string, options: UnitListOptions, summaries: UnitSummary[]) {
  const listed = listOptions(loaded, catalogueId, options)
  cachedIn(unitSummaryCache, loaded, summaryKey(catalogueId, listed), () => ({ get: () => summaries, step: () => true }))
  if (battleSizeSelection(loaded.index, listed.battleSize ?? null) || listed.detachments.selections.length) return
  for (const unit of summaries) seedListPrice(loaded, catalogueId, unit.id, unit.points)
}

// The complete, priced list is cached so each search filters in memory. Waived rules
// change which datasheets the book offers and how many of each, so they belong in the key.
const summaryKey = (catalogueId: string, listed: ListOptions) =>
  `${JSON.stringify(listed.detachments.chosen.map((option) => option.id))}:${catalogueId}:${listed.included ? 'included' : 'all'}:${listed.battleSize ?? 'all'}:${[...listed.waivedRules].toSorted().join(',')}:${restrictionsKey(listed.restrictions)}:${listed.nonMatchedPlay}`

/** The datasheets `unitsIn` lists, in its order, without pricing each of them. */
export function unitIdsIn(loaded: LoadedCatalogue, catalogueId: string, options: UnitListOptions = {}): string[] {
  return completeSteps(listUnits(loaded, catalogueId, listOptions(loaded, catalogueId, options))).map((unit) => unit.id)
}

function* listUnits(
  loaded: LoadedCatalogue,
  catalogueId: string,
  { restrictions, included, battleSize, waivedRules, detachments, nonMatchedPlay }: ListOptions,
) {
  const found: {
    id: string
    name: string
    group: UnitGroup
    keywords: string[] | undefined
    alliedFaction: string | null
    alliedOrder: number
  }[] = []
  const allied = loaded.index.alliedDatasheets.get(catalogueId) ?? new Map<string, { name: string; order: number }>()

  for (const { id, entry, name } of listedDatasheets(loaded, catalogueId, { factionCards: included, nonMatchedPlay })) {
    if (detachments.chosen.length && detachmentsUnlocking(loaded, catalogueId, id, detachments.selections)) continue
    const target = targetOf(entry, loaded.index.definitions)
    const listed = detachmentUnitFacts(loaded, catalogueId, id, detachments.selections)
    // Asked only where a restriction can act on the answer: folding the keywords a
    // datasheet carries costs a default build of it, and most books exclude nothing.
    if (restrictions && restrictedBy(restrictions, name, listed?.keywords ?? keywordsIn(loaded, catalogueId, id))) continue
    const ally = allied.get(id)
    found.push({
      id,
      name,
      group: listed?.group ?? groupOf(entry, target),
      keywords: listed?.keywords,
      alliedFaction: ally?.name ?? null,
      alliedOrder: ally?.order ?? -1,
    })
    yield
  }

  const primary = found.filter((unit) => !unit.alliedFaction).toSorted((left, right) => left.name.localeCompare(right.name))
  const allies = found
    .filter((unit) => unit.alliedFaction)
    .toSorted((left, right) => left.alliedOrder - right.alliedOrder || left.name.localeCompare(right.name))
  const units = []
  for (const unit of [...primary, ...allies]) {
    yield
    const sheet = battleSize !== undefined && isKotcLimit(battleSize) ? datasheetIn(loaded, catalogueId, unit.id) : null
    const facts = sheet ? { keywords: unit.keywords ?? sheet.keywords, toughness: toughnessOf(sheet.profiles) } : null
    if (facts && kotcUnitExclusions(facts, waivedRules).length) continue
    const formatLimit = facts ? formatDatasheetLimit(battleSize!, kotcDatasheetRepeatable(facts.keywords), waivedRules) : null
    units.push({ ...unit, formatLimit })
  }
  return units
}

function* summarizeUnits(loaded: LoadedCatalogue, catalogueId: string, options: ListOptions): Steps<UnitSummary[]> {
  const units = yield* listUnits(loaded, catalogueId, options)
  const size = battleSizeSelection(loaded.index, options.battleSize ?? null)
  const roster = [...(size ? [size] : []), ...options.detachments.selections]
  const summaries: UnitSummary[] = []
  for (const unit of units) {
    yield
    const kind = nonMatchedPlayKind(unit.name)
    summaries.push({
      id: unit.id,
      slug: datasheetSlug(loaded, catalogueId, unit.id),
      name: unit.name,
      group: unit.group,
      allied: Boolean(unit.alliedFaction),
      alliedFaction: unit.alliedFaction,
      ...(kind ? { nonMatchedPlay: kind } : {}),
      points: roster.length ? priceOf(loaded, catalogueId, unit.id, roster) : listPriceOf(loaded, catalogueId, unit.id),
      limit: minimumLimit(limitOf(loaded, catalogueId, unit.id, size), unit.formatLimit),
    })
  }
  return summaries
}

/**
 * How many of one datasheet the roster may hold, or null when nothing limits it.
 *
 * Asked with the battle size in hand, because the number the data carries is the
 * largest game's until a force says which game this is. A page with no roster
 * behind it — a faction's own datasheet list — has no battle size to give.
 */
function limitOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string, battleSize: Selection | null) {
  const entry = loaded.index.definitions.get(entryId)
  if (!entry) return null
  return rosterLimit(entry, loaded.index, { primaryCatalogueId: catalogueId, mustering: true, roster: battleSize ? [battleSize] : [] })
}

// Modifier expansion reads only catalogue definitions, so one expansion serves every roster priced from the catalogue.
const modifierCaches = new WeakMap<LoadedCatalogue, ModifierCache>()

export function contextualUnitLimit(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  battleSize: number,
  waivedRules: readonly string[],
  roster: readonly Selection[],
) {
  const entry = loaded.index.definitions.get(entryId)
  if (!entry) return 0
  const modifierCache = remember(modifierCaches, loaded, () => new WeakMap())
  const limit = rosterLimit(entry, loaded.index, { primaryCatalogueId: catalogueId, mustering: true, roster, modifierCache })
  if (!isKotcLimit(battleSize)) return limit
  const listed = listedUnitFacts(loaded, catalogueId, entryId, roster)
  return minimumLimit(limit, listed ? formatDatasheetLimit(battleSize, kotcDatasheetRepeatable(listed.keywords), waivedRules) : null)
}

function minimumLimit(left: number | null, right: number | null) {
  if (left === null) return right
  if (right === null) return left
  return Math.min(left, right)
}
