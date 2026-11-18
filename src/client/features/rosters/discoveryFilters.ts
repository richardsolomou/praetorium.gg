import type { PlayedArmyFilter, RosterDiscoveryFilter } from '../../../core/rosterDiscovery'
import { facetActive } from '../../../core/listFilter'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'
import type { factionIndexQuery, QueryData } from '../../queries'
import { facetsOf, periodSearch } from '../../searchParams'
import { DISCOVERY_FACETS, type RosterDiscoverySearch } from './rosterSearch'

// Apart from the address parsing, because reading retired rules versions needs their whole table.

type IndexedFactions = NonNullable<QueryData<typeof factionIndexQuery>>['factions']

/** The filter the page's address asks for, read against the faction index. An address can name any rules version of a faction. */
export function discoveryFilter(search: RosterDiscoverySearch, factions: IndexedFactions): RosterDiscoveryFilter {
  const { faction, detachment, rules, size, disposition, legality, points, owner } = facetsOf(search, DISCOVERY_FACETS)
  const familyOf = (slug: string) => {
    const named = factions.find((entry) => entry.slug === slug)
    return named ? [currentCatalogueFamilyId(named.id)] : []
  }
  const family = faction && { in: faction.in.flatMap(familyOf), out: faction.out.flatMap(familyOf) }
  return {
    ...(facetActive(family) ? { faction: family } : {}),
    ...(facetActive(family) && detachment ? { detachment: detachment } : {}),
    ...(rules ? { rules: rules } : {}),
    ...(size ? { size: size } : {}),
    ...(disposition ? { disposition: disposition } : {}),
    ...(legality ? { legality } : {}),
    ...(points ? { points } : {}),
    ...(owner ? { owner: owner } : {}),
    ...(search.q ? { q: search.q } : {}),
  }
}

/** The same address read for the Played tab, which also knows how each battle went and when. */
export function playedFilter(search: RosterDiscoverySearch, factions: IndexedFactions): PlayedArmyFilter {
  const { owner: _owner, ...shared } = discoveryFilter(search, factions)
  const { result, against } = facetsOf(search, DISCOVERY_FACETS)
  return {
    ...shared,
    ...(result ? { result: result } : {}),
    ...(against ? { against: against } : {}),
    ...periodSearch(search),
  }
}
