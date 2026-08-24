import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { formatDatasheetLimit, isKotcLimit, kotcDatasheetRepeatable, kotcUnitExclusions } from '../core/battle'
import { evaluate, rosterLimit } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import type { UnitGroup } from '../core/unitGroups'
import { datasheetSearchFieldsIn, datasheetIn, keywordsIn, toughnessOf } from './catalogue'
import { datasheetSlug, datasheetsOf, type LoadedCatalogue } from './catalogueIndex'
import { matchDatasheet, type DatasheetSearchReason } from './datasheetSearch'
import type { FactionRestrictions } from './wahapedia'

type UnitSummary = {
  id: string
  slug: string
  name: string
  points: number | null
  group: UnitGroup
  limit: number | null
  allied: boolean
  alliedFaction: string | null
  matchReasons?: DatasheetSearchReason[]
}

/** Derived from one immutable catalogue snapshot. Search filters this list in memory. */
const unitSummaryCache = new WeakMap<LoadedCatalogue, Map<string, UnitSummary[]>>()

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
  for (const link of [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])]) {
    if (!link.primary) continue
    const shelf = GROUP_BY_CATEGORY.get((link.name ?? '').trim().toLowerCase())
    if (shelf) return shelf
  }
  return 'other'
}

/** The same shelf by entry id, so a roster and the picker cannot sort a unit differently. */
export function groupOfEntry(index: CatalogueIndex, entryId: string): UnitGroup {
  const entry = index.definitions.get(entryId)
  return entry ? groupOf(entry, targetOf(entry, index.definitions)) : 'other'
}

/** Non-matched-play variants are marked only by a suffix in the community data. */
const NON_MATCHED_PLAY = /\[(?:legends|crucible)\]/i

export function isMatchedPlayDatasheet(index: CatalogueIndex, entry: Definition) {
  const target = targetOf(entry, index.definitions)
  if (entry.hidden || target.hidden || NON_MATCHED_PLAY.test(nameOf(entry, index.definitions))) return false
  const ownerId = index.catalogueOf.get(target.id)
  return !ownerId || index.catalogues.get(ownerId)?.name !== 'Unaligned Forces'
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
export function unitsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  query: string,
  {
    restrictions,
    includeNames,
    battleSize,
  }: { restrictions?: FactionRestrictions; includeNames?: ReadonlySet<string>; battleSize?: number } = {},
): UnitSummary[] {
  const wanted = query.trim().toLowerCase()
  const included = includeNames && new Set([...includeNames].map(referenceName))
  // Faction reference pages use one canonical name set. Cache that complete,
  // priced list so each search does not rebuild every datasheet in the faction.
  const cacheable = restrictions === undefined
  const cacheKey = `${catalogueId}:${includeNames ? 'included' : 'all'}:${battleSize ?? 'all'}`
  const cached = cacheable ? unitSummaryCache.get(loaded)?.get(cacheKey) : undefined
  if (cached) return searchUnits(loaded, catalogueId, wanted, cached)
  const found: { id: string; name: string; group: UnitGroup; alliedFaction: string | null; alliedOrder: number }[] = []
  const allied = loaded.index.alliedDatasheets.get(catalogueId) ?? new Map<string, { name: string; order: number }>()

  for (const id of datasheetsOf(loaded.index, catalogueId)) {
    const entry = loaded.index.definitions.get(id)
    if (!entry) continue
    if (!isMatchedPlayDatasheet(loaded.index, entry)) continue
    const target = targetOf(entry, loaded.index.definitions)
    const name = nameOf(entry, loaded.index.definitions)
    if (included && !includedReferenceName(included, name)) continue
    // Asked only where a restriction can act on the answer: folding the keywords a
    // datasheet carries costs a default build of it, and most books exclude nothing.
    if (restrictions && restricted(name, keywordsIn(loaded, catalogueId, id), restrictions)) continue
    // Unaligned Forces is the shared shelf for Legends fortifications and
    // mission-only battlefield assets. A few assets (including Sentry Gun) lack
    // the suffix even though they are not matched-play roster choices.
    const ally = allied.get(id)
    if (ally?.name === 'Unaligned Forces') continue
    if (!cacheable && wanted) {
      const fields = datasheetSearchFieldsIn(loaded, catalogueId, id)
      if (!fields || !matchDatasheet(wanted, fields)) continue
    }
    found.push({ id, name, group: groupOf(entry, target), alliedFaction: ally?.name ?? null, alliedOrder: ally?.order ?? -1 })
  }

  const primary = found.filter((unit) => !unit.alliedFaction).toSorted((left, right) => left.name.localeCompare(right.name))
  const allies = found
    .filter((unit) => unit.alliedFaction)
    .toSorted((left, right) => left.alliedOrder - right.alliedOrder || left.name.localeCompare(right.name))
  const summaries = [...primary, ...allies].flatMap((unit) => {
    const sheet = battleSize !== undefined && isKotcLimit(battleSize) ? datasheetIn(loaded, catalogueId, unit.id) : null
    const facts = sheet ? { keywords: sheet.keywords, toughness: toughnessOf(sheet.profiles) } : null
    if (facts && kotcUnitExclusions(facts).length) return []
    const formatLimit = facts ? formatDatasheetLimit(battleSize!, kotcDatasheetRepeatable(facts.keywords)) : null
    return [
      {
        id: unit.id,
        slug: datasheetSlug(loaded, catalogueId, unit.id),
        name: unit.name,
        group: unit.group,
        allied: Boolean(unit.alliedFaction),
        alliedFaction: unit.alliedFaction,
        points: sheet?.points ?? priceOf(loaded, catalogueId, unit.id),
        limit: minimumLimit(limitOf(loaded, catalogueId, unit.id), formatLimit),
      },
    ]
  })
  if (cacheable) {
    const entries = unitSummaryCache.get(loaded) ?? new Map<string, UnitSummary[]>()
    entries.set(cacheKey, summaries)
    unitSummaryCache.set(loaded, entries)
  }
  return searchUnits(loaded, catalogueId, wanted, summaries)
}

function searchUnits(loaded: LoadedCatalogue, catalogueId: string, query: string, units: UnitSummary[]) {
  if (!query) return units
  return units
    .flatMap((unit) => {
      const fields = datasheetSearchFieldsIn(loaded, catalogueId, unit.id)
      const match = fields ? matchDatasheet(query, fields) : null
      return match ? [{ unit: match.reasons.length ? { ...unit, matchReasons: match.reasons } : unit, score: match.score }] : []
    })
    .toSorted((left, right) => left.score - right.score || left.unit.name.localeCompare(right.unit.name))
    .map(({ unit }) => unit)
}

/** Catalogue and datacard sources use different apostrophe glyphs in otherwise identical names. */
const referenceName = (name: string) =>
  name
    .normalize('NFKC')
    .replaceAll(/[‘’ʼ]/g, "'")
    .toLocaleLowerCase()

const includedReferenceName = (included: ReadonlySet<string>, name: string) => {
  const normalized = referenceName(name)
  return included.has(normalized) || included.has(`${normalized}s`) || (normalized.endsWith('s') && included.has(normalized.slice(0, -1)))
}

const restricted = (name: string, keywords: readonly string[], restrictions: FactionRestrictions) =>
  restrictions.excludedNames.has(name.trim().toLowerCase()) ||
  keywords.some((keyword) => restrictions.excludedKeywords.has(keyword.trim().toLowerCase()))

/** How many of one datasheet the roster may hold, or null when nothing limits it. */
function limitOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const entry = loaded.index.definitions.get(entryId)
  return entry ? rosterLimit(entry, loaded.index, { primaryCatalogueId: catalogueId }) : null
}

function minimumLimit(left: number | null, right: number | null) {
  if (left === null) return right
  if (right === null) return left
  return Math.min(left, right)
}

/** What the smallest legal version of one datasheet costs, or null if it cannot be built. */
export function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: catalogueId })
  if (!built) return null
  return evaluate([built.selection], loaded.index, { primaryCatalogueId: catalogueId }).points
}
