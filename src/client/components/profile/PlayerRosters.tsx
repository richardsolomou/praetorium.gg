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
  points,
  factions,
  factionsLoading = false,
}: {
  rosters: readonly SavedRoster[]
  points: ReadonlyMap<string, number | null>
  factions: readonly IndexedFaction[]
  factionsLoading?: boolean
}) {
  if (!rosters.length) return null
  return (
    <section data-player-rosters>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Rosters</span>
        <span className="readout">{rosters.length}</span>
      </p>
      <div className="mt-2 space-y-2">
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
                points={points.get(roster.id)}
                factionLoading={factionsLoading}
              />
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}
