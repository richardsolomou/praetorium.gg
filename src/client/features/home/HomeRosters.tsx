import { Link } from '@tanstack/react-router'
import { ShelfLink } from '../../components/ShelfLink'
import { ScrollText } from 'lucide-react'
import type { SavedRoster } from '../rosters/rosterLibrary'
import { pointsBudgetOf } from '../../../core/battle'
import { FactionMark } from '../../components/FactionMark'
import { PROBLEM_LABEL, type RosterProblem, type RosterSummaryFaction, rosterTitle } from '../rosters/RosterSummary'
import { SectionHeading } from '../../components/SectionHeading'

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
 * A row is the name over the army, with the points, rather than the library's
 * summary: the library is where a list is read in full, printed, shared or deleted,
 * and this is only the way back into the one being worked on.
 */
export function HomeRosters({ rosters, count, changed }: { rosters: readonly HomeRoster[]; count: number; changed: ReadonlySet<string> }) {
  return (
    <section data-home-rosters>
      <SectionHeading title="Your rosters" count={count} />
      {rosters.length ? (
        <ul className="divide-y divide-edge border-y border-edge">
          {rosters.map(({ roster, faction, points, label, problem }) => (
            <li key={roster.id}>
              <Link
                to="/rosters/$id"
                params={{ id: roster.id }}
                className="flex min-h-14 min-w-0 items-center gap-3 px-2 py-2.5 transition-colors hover:bg-raised"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] leading-tight font-bold">{rosterTitle(roster, faction, label)}</span>
                  <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-faint">
                    {faction ? <FactionMark faction={faction} size="sm" /> : null}
                    <span className="truncate">{faction?.displayName}</span>
                    {changed.has(roster.id) ? <span className="eyebrow shrink-0 text-discarded">Changed</span> : null}
                  </span>
                </span>
                {problem ? (
                  <span className="shrink-0 rounded-md border border-destructive/60 px-1.5 py-px text-xs font-semibold text-destructive">
                    {PROBLEM_LABEL[problem]}
                  </span>
                ) : (
                  <span className="figure shrink-0 text-2xl leading-none text-bone">
                    {points ?? '—'}
                    <span className="text-base font-bold text-faint">/{pointsBudgetOf(roster)}</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-3 border-y border-edge px-2 py-4 font-rules text-sm text-dim">
          <ScrollText className="size-5 shrink-0 text-parchment" aria-hidden />
          Build a list from the army data, or import one from another app.
        </p>
      )}
      <ShelfLink to="/rosters" className="mt-3">
        All my rosters
      </ShelfLink>
    </section>
  )
}
