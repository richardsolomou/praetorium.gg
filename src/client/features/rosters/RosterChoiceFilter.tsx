import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { GAME_SIZES, battleSizeOptionLabel } from '../../../core/battle'
import { countBy } from '../../../core/collections'
import { type FacetAddress, facetMatches, facetText } from '../../../core/listFilter'
import { matchesRosterAssessment, rosterAssessmentFilterActive, ROSTER_SEARCH_MAX_LENGTH } from '../../../core/rosterDiscovery'
import { compareRosters, type RosterSort } from '../../../core/rosterSort'
import { useFavouriteFactions } from '../../favouriteFactions'
import { FilterBar, type FilterDimension } from '../../components/FilterBar'
import { ungrouped } from '../../components/SearchableSelect'
import { factionIndexQuery } from '../../queries'
import { facetsOf } from '../../searchParams'
import { countLabel, matchesSearch } from '../../text'
import { factionSelectGroups } from './builder/factions'
import type { LentRoster } from './LentRosters'
import { RosterSortMenu, ROSTER_ASSESSMENT_DIMENSIONS } from './RosterFilters'
import type { SavedRoster } from './rosterLibrary'
import { useRosterPages } from './rosterPages'
import { rosterTitle } from './RosterSummary'

const FACETS = ['faction', 'detachment', 'size', 'legality', 'points'] as const
type ChoiceSearch = { q?: string; sort?: RosterSort } & Partial<Record<(typeof FACETS)[number], FacetAddress>>

/**
 * The library's search, filters and sort over the lists a dialog offers, your own and those lent to you.
 *
 * Held in the dialog's owner rather than the address, so a filter outlives closing the dialog but not the page.
 */
export function useRosterChoiceFilter({ rosters, lent }: { rosters: readonly SavedRoster[]; lent: readonly LentRoster[] }) {
  const [search, setSearch] = useState<ChoiceSearch>({})
  const { data: index } = useQuery(factionIndexQuery())
  const { favourites } = useFavouriteFactions()
  const factions = index?.factions ?? []
  const facets = facetsOf(search, FACETS)
  const needsAssessment = rosterAssessmentFilterActive(facets)
  const factionOf = (roster: SavedRoster) => factions.find((faction) => faction.id === roster.catalogueId)
  const matches = (roster: SavedRoster) => {
    const faction = factionOf(roster)
    return (
      facetMatches(facets.faction, faction ? [faction.slug] : []) &&
      facetMatches(facets.detachment, roster.detachmentIds) &&
      facetMatches(facets.size, [String(roster.limit)]) &&
      (!search.q || matchesSearch(`${rosterTitle(roster, faction)} ${faction?.displayName ?? ''}`, search.q))
    )
  }
  const candidates = rosters.filter(matches)
  // Only lists this filter has to judge are priced beyond the ones on screen; a lent list arrives priced.
  const assessed = useRosterPages(needsAssessment ? candidates.map((roster) => roster.id) : [], true)
  const assess = (entry: { points?: number | null; problem?: string | null } | undefined) =>
    !needsAssessment || Boolean(entry && matchesRosterAssessment(facets, { points: entry.points ?? null, problem: entry.problem ?? null }))
  const shownRosters = candidates.filter((roster) => assess(assessed.byId.get(roster.id)))
  const sort = search.sort ?? 'updated-desc'
  const shownLent = lent
    .filter(({ summary, points, problem }) => matches(summary) && assess({ points, problem }))
    .toSorted((left, right) => compareRosters(sort)(left.summary, right.summary))

  const all = [...rosters, ...lent.map(({ summary }) => summary)]
  const tally = <T,>(values: T[]) => countBy(values, (value) => value)
  const perFaction = tally(all.map((roster) => roster.catalogueId))
  const perDetachment = tally(all.flatMap((roster) => roster.detachmentIds))
  const perSize = tally(all.map((roster) => roster.limit))
  const detachmentNames = new Map(
    factions.flatMap((faction) => faction.detachments.map((detachment) => [detachment.id, detachment.name] as const)),
  )
  const dimensions: FilterDimension[] = [
    {
      key: 'faction',
      label: 'Faction',
      pinned: true,
      groups: factionSelectGroups(
        factions.filter((faction) => perFaction.has(faction.id)),
        favourites,
      ).map((group) => ({
        ...group,
        items: group.items.map((item) => ({
          ...item,
          value: factions.find((faction) => faction.id === item.value)?.slug ?? item.value,
          detail: String(perFaction.get(item.value) ?? 0),
        })),
      })),
    },
    {
      key: 'detachment',
      label: 'Detachment',
      pinned: true,
      groups: ungrouped(
        [...perDetachment]
          .map(([id, count]) => ({ label: detachmentNames.get(id) ?? id, value: id, detail: String(count) }))
          .toSorted((left, right) => left.label.localeCompare(right.label)),
      ),
    },
    {
      key: 'size',
      label: 'Battle size',
      // A battle that fixes the size leaves one choice, which would only take room.
      pinned: perSize.size > 1,
      groups: ungrouped(
        GAME_SIZES.filter((size) => perSize.has(size.limit)).map((size) => ({
          label: battleSizeOptionLabel(size),
          value: String(size.limit),
          detail: String(perSize.get(size.limit)),
        })),
      ),
    },
    ...ROSTER_ASSESSMENT_DIMENSIONS,
  ]
  const { sort: _sort, ...address } = search
  const count = shownRosters.length + shownLent.length
  return {
    rosters: shownRosters,
    lent: shownLent,
    sort,
    /** Whether the lists a legality or points filter judges are still being priced. */
    pending: needsAssessment && assessed.results.some((result) => result.isPending),
    /** Whether a list a legality or points filter judges could not be priced, and so is missing. */
    failed: needsAssessment && assessed.results.some((result) => result.isError),
    // A filter left on by an earlier opening stays visible, or nothing would say what hides the lists.
    bar:
      all.length > 1 || Object.values(address).some(Boolean) ? (
        <FilterBar
          scope="rosters:choose"
          label="Roster"
          query={search.q ?? ''}
          onQuery={(next) => setSearch({ ...search, q: next.trim() || undefined })}
          placeholder="Search rosters…"
          maxQueryLength={ROSTER_SEARCH_MAX_LENGTH}
          dimensions={dimensions}
          value={facets}
          onChange={(key, facet) => setSearch({ ...search, [key]: facetText(facet) })}
          address={address}
          onApply={(next) => setSearch({ ...next, sort: search.sort })}
          sort={<RosterSortMenu value={sort} onChange={(next) => setSearch({ ...search, sort: next })} />}
          summary={countLabel(count, 'roster')}
        />
      ) : null,
  }
}
