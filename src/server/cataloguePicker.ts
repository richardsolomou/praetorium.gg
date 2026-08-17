import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate, rosterLimit } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import { datasheetSlug, datasheetsOf, type LoadedCatalogue } from './catalogueIndex'

export type UnitGroup = 'character' | 'battleline' | 'transport' | 'other'

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

const GROUP_BY_CATEGORY = new Map<string, UnitGroup>([
  ['character', 'character'],
  ['battleline', 'battleline'],
  ['dedicated transport', 'transport'],
])

/** The keywords are on the datasheet, so a link is read together with what it points at. */
function groupOf(entry: Definition, target: Definition): UnitGroup {
  for (const link of [...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])]) {
    const group = GROUP_BY_CATEGORY.get((link.name ?? '').trim().toLowerCase())
    if (group) return group
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

/**
 * The pickable datasheets in a book, with the price of the smallest legal version
 * of each. Points are derived here and never stored: the data revision is what a
 * roster pins, and the number follows from it.
 *
 * Pricing is the same `buildUnit` the roster itself goes through, so a number in
 * the picker cannot disagree with the number the unit costs once added. A page of
 * results is small enough for that to be cheap; the whole book would not be.
 */
export function unitsIn(
  loaded: LoadedCatalogue,
  catalogueId: string,
  query: string,
  { limit = 60 }: { limit?: number } = {},
): UnitSummary[] {
  const wanted = query.trim().toLowerCase()
  const found: { id: string; name: string; group: UnitGroup; alliedFaction: string | null; alliedOrder: number }[] = []
  const allied = loaded.index.alliedDatasheets.get(catalogueId) ?? new Map<string, { name: string; order: number }>()

  for (const id of datasheetsOf(loaded.index, catalogueId)) {
    const entry = loaded.index.definitions.get(id)
    if (!entry) continue
    const target = targetOf(entry, loaded.index.definitions)
    if (entry.hidden || target.hidden) continue
    const name = nameOf(entry, loaded.index.definitions)
    if (NON_MATCHED_PLAY.test(name)) continue
    // Unaligned Forces is the shared shelf for Legends fortifications and
    // mission-only battlefield assets. A few assets (including Sentry Gun) lack
    // the suffix even though they are not matched-play roster choices.
    const ally = allied.get(id)
    if (ally?.name === 'Unaligned Forces') continue
    if (wanted && !name.toLowerCase().includes(wanted)) continue
    found.push({ id, name, group: groupOf(entry, target), alliedFaction: ally?.name ?? null, alliedOrder: ally?.order ?? -1 })
  }

  const primary = found.filter((unit) => !unit.alliedFaction).toSorted((left, right) => left.name.localeCompare(right.name))
  const allies = found
    .filter((unit) => unit.alliedFaction)
    .toSorted((left, right) => left.alliedOrder - right.alliedOrder || left.name.localeCompare(right.name))
  const page = [...primary.slice(0, limit), ...allies]
  return page.map((unit) => ({
    id: unit.id,
    slug: datasheetSlug(loaded, catalogueId, unit.id),
    name: unit.name,
    group: unit.group,
    allied: Boolean(unit.alliedFaction),
    alliedFaction: unit.alliedFaction,
    points: priceOf(loaded, catalogueId, unit.id),
    limit: limitOf(loaded, catalogueId, unit.id),
  }))
}

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
