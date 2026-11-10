import { rulesVersionDetails, type CatalogueEdition } from './catalogueEdition'
import { currentCatalogueFamilyId, savedCatalogueIds, savedDetachmentIds } from './retiredCatalogueIds'
import { facetActive, facetMatches, type Facet } from './listFilter'
import type { RosterDiscoveryFilter, RulesVersionStatus } from './rosterDiscovery'

type IndexedFaction = {
  id: string
  edition?: Pick<CatalogueEdition, 'name' | 'status' | 'description'> | null
  rulesName?: string
  isDefault?: boolean
}

export function rulesVersionStatus(faction: IndexedFaction): RulesVersionStatus | null {
  const { status } = rulesVersionDetails(faction)
  return status === 'Current' ? 'current' : status === 'Archived' ? 'archived' : status === 'Preview' ? 'preview' : null
}

type ArmyFilter = Pick<RosterDiscoveryFilter, 'faction' | 'detachment' | 'rules'>

/** The saved IDs a page can hold for this filter, or null when no rules version in the index matches it. */
export function discoveryScope(filter: ArmyFilter, factions: readonly IndexedFaction[]) {
  const inScope = (faction: IndexedFaction) =>
    facetMatches(filter.faction, [currentCatalogueFamilyId(faction.id)]) && facetMatches(filter.rules, [rulesVersionStatus(faction) ?? ''])
  const catalogueIds =
    facetActive(filter.faction) || facetActive(filter.rules) ? factions.filter(inScope).map((faction) => faction.id) : null
  if (catalogueIds && !catalogueIds.length) return null
  return {
    catalogueIds: catalogueIds && savedCatalogueIds(catalogueIds),
    detachmentIds: filter.detachment?.in.length ? savedDetachmentIds([...filter.detachment.in]) : null,
    excludedDetachmentIds: filter.detachment?.out.length ? savedDetachmentIds([...filter.detachment.out]) : [],
  }
}

/**
 * An Against filter's faction slugs as the families `PlayedArmy.against` holds, so it finds the faction under any rules
 * version. A slug the index does not know stays as it is and matches nothing.
 */
export function againstFamilies(facet: Facet, factions: readonly (IndexedFaction & { slug: string })[]): Facet {
  const family = (slug: string) => {
    const named = factions.find((faction) => faction.slug === slug)
    return named ? currentCatalogueFamilyId(named.id) : slug
  }
  return { in: facet.in.map(family), out: facet.out.map(family) }
}

/** Whether a roster, read against current IDs, is inside the filter. */
export function inDiscoveryScope(
  roster: { catalogueId: string; detachmentIds: readonly string[] },
  filter: ArmyFilter,
  factions: ReadonlyMap<string, IndexedFaction>,
) {
  const faction = factions.get(roster.catalogueId)
  return (
    facetMatches(filter.faction, [currentCatalogueFamilyId(roster.catalogueId)]) &&
    facetMatches(filter.rules, faction ? [rulesVersionStatus(faction) ?? ''] : []) &&
    facetMatches(filter.detachment, roster.detachmentIds)
  )
}

/** The facets a discovery tab can say how many of its lists fall under, keyed by the values its filters send. */
export const DISCOVERY_COUNT_FACETS = ['faction', 'detachment', 'rules', 'size', 'disposition', 'owner', 'result', 'against'] as const
export type DiscoveryCounts = Partial<Record<(typeof DISCOVERY_COUNT_FACETS)[number], Record<string, number>>>

/**
 * How many lists a tab holds under each value of each facet, over the whole tab rather than what its filters leave.
 *
 * Read against current IDs, as `inDiscoveryScope` reads them, so a count agrees with what choosing it finds: factions
 * by family, rules by status. `count` stands for that many identical lists.
 */
export function discoveryCounts(
  lists: Iterable<{
    catalogueId: string
    detachmentIds: readonly string[]
    limit: number
    disposition: string | null
    ownerId?: string
    result?: string
    /** The families of the factions it played against. */
    against?: readonly string[]
    count?: number
  }>,
  factions: ReadonlyMap<string, IndexedFaction>,
): DiscoveryCounts {
  const counts: Required<DiscoveryCounts> = {
    faction: {},
    detachment: {},
    rules: {},
    size: {},
    disposition: {},
    owner: {},
    result: {},
    against: {},
  }
  const add = (facet: keyof DiscoveryCounts, values: Iterable<string>, count: number) => {
    for (const value of new Set(values)) counts[facet][value] = (counts[facet][value] ?? 0) + count
  }
  for (const list of lists) {
    const count = list.count ?? 1
    const faction = factions.get(list.catalogueId)
    add('faction', [currentCatalogueFamilyId(list.catalogueId)], count)
    add('detachment', list.detachmentIds, count)
    add('rules', faction ? [rulesVersionStatus(faction) ?? ''].filter(Boolean) : [], count)
    add('size', [String(list.limit)], count)
    add('disposition', list.disposition ? [list.disposition] : [], count)
    add('owner', list.ownerId ? [list.ownerId] : [], count)
    add('result', list.result ? [list.result] : [], count)
    add('against', list.against ?? [], count)
  }
  return Object.fromEntries(Object.entries(counts).filter(([, values]) => Object.keys(values).length))
}
