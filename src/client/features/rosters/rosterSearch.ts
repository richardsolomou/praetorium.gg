import type { PlayedArmyFilter, RosterDiscoveryFilter } from '../../../core/rosterDiscovery'
import { facetActive, type FacetAddress, type PeriodFilter } from '../../../core/listFilter'
import { currentCatalogueFamilyId } from '../../../core/retiredCatalogueIds'
import type { RosterSort } from '../../../core/rosterSort'
import type { factionIndexQuery, QueryData } from '../../queries'
import { facetsOf, periodSearch } from '../../searchParams'
import type { MissionReference } from './rosterStart'

// Route search validation runs in the app's entry bundle, so these stay apart from the pages that render them.

export const ROSTER_VIEWS = ['friends', 'public', 'played', 'winning'] as const
type RosterView = (typeof ROSTER_VIEWS)[number]

export const LIBRARY_FACETS = [
  'limit',
  'faction',
  'detachment',
  'visibility',
  'disposition',
  'legality',
  'points',
  'updates',
  'state',
] as const
export type RosterLibrarySearch = PeriodFilter & { q?: string } & Partial<Record<(typeof LIBRARY_FACETS)[number], FacetAddress>>

export const DISCOVERY_FACETS = [
  'faction',
  'detachment',
  'rules',
  'size',
  'disposition',
  'legality',
  'points',
  'owner',
  'result',
  'against',
] as const
export type RosterDiscoverySearch = PeriodFilter & { q?: string; sort?: RosterSort } & Partial<
    Record<(typeof DISCOVERY_FACETS)[number], FacetAddress>
  >

/** The Winning tab's filters: detachments by slug, so one shared by several chapters is one choice. */
export const WINNING_FACETS = ['faction', 'detachment', 'disposition', 'placing', 'players'] as const
export type WinningSearch = PeriodFilter & { q?: string } & Partial<Record<(typeof WINNING_FACETS)[number], FacetAddress>>

export type RostersSearch = RosterLibrarySearch &
  RosterDiscoverySearch &
  WinningSearch & { view?: RosterView; new?: true; reference?: MissionReference }

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
