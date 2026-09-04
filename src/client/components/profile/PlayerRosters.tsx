import { Link } from '@tanstack/react-router'
import { RosterSummary, type RosterSummaryFaction } from '../rosters/RosterSummary'
import type { SavedRoster } from '../rosters/rosterLibrary'

/** A faction as the index names it, which is how a roster's catalogue id is matched. */
type IndexedFaction = RosterSummaryFaction & { id: string }

/**
 * The lists this player has published.
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
  factionsLoading = false,
}: {
  rosters: readonly SavedRoster[]
  totals: ReadonlyMap<string, { points: number | null; label: string }>
  factions: readonly IndexedFaction[]
  factionsLoading?: boolean
}) {
  if (!rosters.length) return null
  return (
    <section data-player-rosters>
      <div className="space-y-2">
        {rosters.map((roster) => (
          <article
            key={roster.id}
            data-roster={roster.name}
            className="flex items-center gap-2 border border-edge bg-panel p-2 hover:border-azure"
          >
            <Link to="/rosters/$id" params={{ id: roster.id }} className="flex min-w-0 flex-1 flex-wrap items-center gap-2 p-1">
              <RosterSummary
                roster={roster}
                faction={factions.find((faction) => faction.id === roster.catalogueId)}
                points={totals.get(roster.id)?.points}
                label={totals.get(roster.id)?.label}
                factionLoading={factionsLoading}
              />
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
