import { Link } from '@tanstack/react-router'
import { GAME_SIZES, battleSizeOptionLabel } from '../../../core/battle'
import { countBy } from '../../../core/collections'
import { facetMatches, facetText } from '../../../core/listFilter'
import { matchesRosterAssessment, ROSTER_SEARCH_MAX_LENGTH } from '../../../core/rosterDiscovery'
import { sortRosters } from '../../../core/rosterSort'
import { FilterBar, type FilterDimension } from '../../components/FilterBar'
import { NoFilterMatches } from '../../components/NoFilterMatches'
import { ungrouped } from '../../components/SearchableSelect'
import type { QueryData, factionIndexQuery } from '../../queries'
import { facetsOf } from '../../searchParams'
import { PLAYER_ROSTER_FACETS, type PlayerRosterSearch } from './profileSearch'
import { countLabel, matchesSearch } from '../../text'
import { factionSelectGroups } from '../rosters/builder/factions'
import { RosterSortMenu, ROSTER_POINTS_DIMENSION } from '../rosters/RosterFilters'
import { RosterSummary, rosterTitle } from '../rosters/RosterSummary'
import type { SavedRoster } from '../rosters/rosterLibrary'

type IndexedFaction = NonNullable<QueryData<typeof factionIndexQuery>>['factions'][number]

/**
 * The lists this player has published, narrowed in the browser since all of them are already here.
 *
 * The same summary the owner's own library draws, in a row without the controls
 * that belong to an owner: a reader of somebody else's profile can open a list and
 * nothing else. Private and unlisted lists are not here — an unlisted one is a link
 * its owner handed somebody, and a list of those would be handing it to everybody.
 */
export function PlayerRosters({
  rosters,
  totals,
  factions,
  factionsLoading,
  favourites,
  search,
  onChange,
}: {
  rosters: readonly SavedRoster[]
  totals: ReadonlyMap<string, { points: number | null; label: string }>
  factions: readonly IndexedFaction[]
  factionsLoading: boolean
  favourites: ReadonlySet<string>
  search: PlayerRosterSearch
  onChange: (next: PlayerRosterSearch) => void
}) {
  const facets = facetsOf(search, PLAYER_ROSTER_FACETS)
  const factionOf = (roster: SavedRoster) => factions.find((faction) => faction.id === roster.catalogueId)
  const shown = sortRosters(
    rosters.filter((roster) => {
      const faction = factionOf(roster)
      return (
        facetMatches(facets.faction, faction ? [faction.slug] : []) &&
        facetMatches(facets.detachment, roster.detachmentIds) &&
        facetMatches(facets.size, [String(roster.limit)]) &&
        // A list the totals have not priced passes only an exclusion, as everywhere else rosters are narrowed by points.
        (!facets.points ||
          matchesRosterAssessment({ points: facets.points }, { points: totals.get(roster.id)?.points ?? null, problem: null })) &&
        (!search.q || matchesSearch(`${rosterTitle(roster, faction)} ${faction?.displayName ?? ''}`, search.q))
      )
    }),
    search.sort ?? 'updated-desc',
  )
  // The choices are what this player has published, each saying how many.
  const tally = <T,>(values: T[]) => countBy(values, (value) => value)
  const perFaction = tally(rosters.map((roster) => roster.catalogueId))
  const perDetachment = tally(rosters.flatMap((roster) => roster.detachmentIds))
  const perSize = tally(rosters.map((roster) => roster.limit))
  const held = factions.filter((faction) => perFaction.has(faction.id))
  const detachmentNames = new Map(
    factions.flatMap((faction) => faction.detachments.map((detachment) => [detachment.id, detachment.name] as const)),
  )
  const dimensions: FilterDimension[] = [
    {
      key: 'faction',
      label: 'Faction',
      pinned: true,
      groups: factionSelectGroups(held, favourites).map((group) => ({
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
      pinned: true,
      groups: ungrouped(
        GAME_SIZES.filter((size) => perSize.has(size.limit)).map((size) => ({
          label: battleSizeOptionLabel(size),
          value: String(size.limit),
          detail: String(perSize.get(size.limit)),
        })),
      ),
    },
    ROSTER_POINTS_DIMENSION,
  ]
  const { sort, ...address } = search
  return (
    <section data-player-rosters className="space-y-4">
      {rosters.length > 1 ? (
        <FilterBar
          scope="rosters:player"
          label="Roster"
          query={search.q ?? ''}
          onQuery={(next) => onChange({ ...search, q: next.trim() || undefined })}
          placeholder="Search rosters…"
          maxQueryLength={ROSTER_SEARCH_MAX_LENGTH}
          dimensions={dimensions}
          value={facets}
          onChange={(key, facet) => onChange({ ...search, [key]: facetText(facet) })}
          address={address}
          onApply={(next) => onChange({ ...next, sort })}
          sort={<RosterSortMenu value={sort ?? 'updated-desc'} onChange={(next) => onChange({ ...search, sort: next })} />}
          summary={countLabel(shown.length, 'roster')}
        />
      ) : null}
      {shown.length ? (
        <div className="space-y-2">
          {shown.map((roster) => (
            <article
              key={roster.id}
              data-roster={roster.name}
              className="flex items-center gap-2 part p-2 transition-colors hover:border-info hover:bg-raised"
            >
              <Link to="/rosters/$id" params={{ id: roster.id }} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 p-1">
                <RosterSummary
                  roster={roster}
                  faction={factionOf(roster)}
                  points={totals.get(roster.id)?.points}
                  label={totals.get(roster.id)?.label}
                  factionLoading={factionsLoading}
                  showLock={false}
                />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <NoFilterMatches>No rosters match these filters.</NoFilterMatches>
      )}
    </section>
  )
}
