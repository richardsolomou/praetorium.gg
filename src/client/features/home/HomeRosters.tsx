import { Link } from '@tanstack/react-router'
import { ShelfLink } from '../../components/ShelfLink'
import { ScrollText } from 'lucide-react'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { pointsBudgetOf } from '../../../core/battle'
import { FactionMark } from '../../components/FactionMark'
import { PROBLEM_LABEL, type RosterProblem, type RosterSummaryFaction, rosterTitle } from '../rosters/RosterSummary'
import { countLabel } from '../../text'

/** One saved list as the home page shows it, already joined to its faction, totals and status. */
export type HomeRoster = {
  roster: SavedRoster
  faction?: RosterSummaryFaction
  points?: number | null
  label?: string
  problem: RosterProblem | null
}

/**
 * The lists the player touched last, because between games the list is what they came back for.
 *
 * A row is a line — the army, the name and the points — rather than the library's
 * summary: the library is where a list is read in full, printed, shared or deleted,
 * and this is only the way back into the one being worked on.
 */
export function HomeRosters({ rosters, count, changed }: { rosters: readonly HomeRoster[]; count: number; changed: number }) {
  return (
    <section data-home-rosters>
      <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Your rosters</span>
        <span className="readout">{count}</span>
      </h2>
      {rosters.length ? (
        <ul className="divide-y divide-edge border-b border-edge">
          {rosters.map(({ roster, faction, points, label, problem }) => (
            <li key={roster.id}>
              <Link
                to="/rosters/$id"
                params={{ id: roster.id }}
                className="flex min-w-0 items-center gap-2 -mx-3 px-3 py-3 hover:bg-raised"
              >
                {faction ? <FactionMark faction={faction} size="sm" /> : null}
                <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase">{rosterTitle(roster, faction, label)}</span>
                {problem ? (
                  <span className="shrink-0 text-xs font-semibold text-destructive">{PROBLEM_LABEL[problem]}</span>
                ) : (
                  <span className="readout shrink-0 text-sm text-dim">
                    {points ?? '—'}/{pointsBudgetOf(roster)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-3 border-b border-edge py-4 font-rules text-sm text-dim">
          <ScrollText className="size-5 shrink-0 text-parchment" aria-hidden />
          Build a list from the army data, or import one from another app.
        </p>
      )}
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <ShelfLink to="/rosters">All my rosters</ShelfLink>
        {changed ? (
          <Link to="/rosters" search={{ updates: 'changed' }} className="text-xs font-semibold text-discarded hover:text-bone">
            {countLabel(changed, 'list')} changed by a data update
          </Link>
        ) : null}
      </p>
    </section>
  )
}
