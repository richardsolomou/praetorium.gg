import { Link } from '@tanstack/react-router'
import { ChevronRight, ScrollText } from 'lucide-react'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { FactionMark } from '../../components/FactionMark'
import { PROBLEM_LABEL, type RosterProblem, type RosterSummaryFaction, rosterTitle } from '../rosters/RosterSummary'

/** One saved list as the home page shows it, already joined to its faction, totals and status. */
export type HomeRoster = {
  roster: SavedRoster
  faction?: RosterSummaryFaction
  points?: number | null
  label?: string
  problem: RosterProblem | null
  /** How many data updates since it was saved reached something in it. */
  changes: number
}

/** Enough lists to reach the one being worked on; the library is the archive. */
const RECENT = 5

/**
 * The lists the player touched last, because between games the list is what they came back for.
 *
 * A row is a line — the army, the name and the points — rather than the library's
 * summary: the library is where a list is read in full, printed, shared or deleted,
 * and this is only the way back into the one being worked on.
 */
export function HomeRosters({ rosters }: { rosters: readonly HomeRoster[] }) {
  const changed = rosters.filter((entry) => entry.changes > 0).length
  const recent = rosters.slice(0, RECENT)
  return (
    <section data-home-rosters>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Your rosters</span>
        <span className="readout">{rosters.length}</span>
      </p>
      {recent.length ? (
        <ul className="divide-y divide-edge border-b border-edge">
          {recent.map(({ roster, faction, points, label, problem }) => (
            <li key={roster.id}>
              <Link
                to="/rosters/$id"
                params={{ id: roster.id }}
                className="flex min-w-0 items-center gap-2 -mx-3 px-3 py-3 hover:bg-raised"
              >
                {faction ? <FactionMark id={faction.slug} icon={faction.icon} size="sm" /> : null}
                <span className="min-w-0 flex-1 truncate text-sm font-bold uppercase">{rosterTitle(roster, faction, label)}</span>
                {problem ? (
                  <span className="shrink-0 text-xs font-semibold text-destructive">{PROBLEM_LABEL[problem]}</span>
                ) : (
                  <span className="readout shrink-0 text-sm text-dim">
                    {points ?? '—'}/{roster.limit}
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
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Link to="/rosters" className="eyebrow inline-flex items-center gap-1 text-info hover:text-parchment">
          All my rosters <ChevronRight className="size-3.5" />
        </Link>
        {changed ? (
          <Link to="/data-updates" className="text-xs font-semibold text-discarded hover:text-bone">
            {changed} {changed === 1 ? 'list' : 'lists'} changed by a data update
          </Link>
        ) : null}
      </p>
    </section>
  )
}
