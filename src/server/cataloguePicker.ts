import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate, rosterLimit } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import type { UnitGroup } from '../core/unitGroups'
import { keywordsIn } from './catalogue'
import { datasheetSlug, datasheetsOf, type LoadedCatalogue } from './catalogueIndex'
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

/** The primary category is on the datasheet, so a link is read together with what it points at. */
function groupOf(entry: Definition, target: Definition): UnitGroup {
  const primary = [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])].find((link) => link.primary)
  return primary ? (GROUP_BY_CATEGORY.get((primary.name ?? '').trim().toLowerCase()) ?? 'other') : 'other'
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
  { restrictions, includeNames }: { restrictions?: FactionRestrictions; includeNames?: ReadonlySet<string> } = {},
): UnitSummary[] {
  const wanted = query.trim().toLowerCase()
  const included = includeNames && new Set([...includeNames].map(referenceName))
  // Faction reference pages use one canonical name set. Cache that complete,
  // priced list so each search does not rebuild every datasheet in the faction.
  const cacheable = restrictions === undefined
  const cacheKey = `${catalogueId}:${includeNames ? 'included' : 'all'}`
  const cached = cacheable ? unitSummaryCache.get(loaded)?.get(cacheKey) : undefined
  if (cached) return wanted ? cached.filter((unit) => unit.name.toLowerCase().includes(wanted)) : cached
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
    if (!cacheable && wanted && !name.toLowerCase().includes(wanted)) continue
    found.push({ id, name, group: groupOf(entry, target), alliedFaction: ally?.name ?? null, alliedOrder: ally?.order ?? -1 })
  }

  const primary = found.filter((unit) => !unit.alliedFaction).toSorted((left, right) => left.name.localeCompare(right.name))
  const allies = found
    .filter((unit) => unit.alliedFaction)
    .toSorted((left, right) => left.alliedOrder - right.alliedOrder || left.name.localeCompare(right.name))
  const summaries = [...primary, ...allies].map((unit) => ({
    id: unit.id,
    slug: datasheetSlug(loaded, catalogueId, unit.id),
    name: unit.name,
    group: unit.group,
    allied: Boolean(unit.alliedFaction),
    alliedFaction: unit.alliedFaction,
    points: priceOf(loaded, catalogueId, unit.id),
    limit: limitOf(loaded, catalogueId, unit.id),
  }))
  if (cacheable) {
    const entries = unitSummaryCache.get(loaded) ?? new Map<string, UnitSummary[]>()
    entries.set(cacheKey, summaries)
    unitSummaryCache.set(loaded, entries)
  }
  return wanted ? summaries.filter((unit) => unit.name.toLowerCase().includes(wanted)) : summaries
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

/** What the smallest legal version of one datasheet costs, or null if it cannot be built. */
export function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: catalogueId })
  if (!built) return null
  return evaluate([built.selection], loaded.index, { primaryCatalogueId: catalogueId }).points
}
