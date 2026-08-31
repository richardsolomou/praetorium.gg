import { Link } from '@tanstack/react-router'
import { ChevronRight, Trophy } from 'lucide-react'
import type { Standing, StandingSubject } from '../../core/standings'
import { winRate } from '../../core/standings'
import { PlayerAvatar } from './PlayerAvatar'

/** What each table is called, and what the thing in its second column is. */
export const SUBJECTS: Record<StandingSubject, { heading: string; column: string; blank: string }> = {
  player: { heading: 'Players', column: 'Player', blank: 'No finished battles yet.' },
  faction: { heading: 'Factions', column: 'Faction', blank: 'No catalogue-built armies have finished a battle yet.' },
  detachment: { heading: 'Detachments', column: 'Detachment', blank: 'No detachments have finished a battle yet.' },
}

/**
 * One standings table, as far down as the caller asked for.
 *
 * Player names are not linked. A profile is readable to a friend, or to someone
 * who shares or is watching a battle, and this table is read by people who are
 * neither — so a link from every row would be a page most readers cannot open.
 */
export function Standings({
  standings,
  subject,
  limit,
  footer,
}: {
  standings: readonly Standing[]
  subject: StandingSubject
  limit?: number
  footer?: boolean
}) {
  const { heading, column, blank } = SUBJECTS[subject]
  const shown = limit === undefined ? standings : standings.slice(0, limit)
  return (
    <section data-standings={subject}>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{heading}</span>
        <span className="readout">{standings.length}</span>
      </p>
      {shown.length ? (
        <>
          {/*
            Fixed layout, because a long name is content a table would otherwise
            widen itself to fit — and a table that grows past its column is the one
            thing on this page that can push a phone sideways. The declared widths
            hold and the name column takes whatever is left of the row.
          */}
          <table className="mt-2 w-full table-fixed border-collapse border border-edge bg-panel text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-[0.625rem] text-faint uppercase">
                <th scope="col" className="w-10 p-2 font-normal">
                  #
                </th>
                <th scope="col" className="p-2 font-normal">
                  {column}
                </th>
                <th scope="col" className="w-12 p-2 text-right font-normal">
                  Won
                </th>
                <th scope="col" className="hidden w-24 p-2 text-right font-normal sm:table-cell">
                  Record
                </th>
                <th scope="col" className="w-14 p-2 text-right font-normal">
                  Rate
                </th>
                <th scope="col" className="hidden w-16 p-2 text-right font-normal sm:table-cell">
                  VP
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row, place) => (
                <tr key={row.id} data-standing={row.id} className="border-b border-edge last:border-0">
                  <td className="readout p-2 text-faint">{place + 1}</td>
                  <td className="overflow-hidden p-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {subject === 'player' ? <PlayerAvatar name={row.name} className="size-6 text-[0.625rem]" /> : null}
                      <span className="truncate font-bold uppercase">{row.name}</span>
                    </span>
                  </td>
                  <td className="readout p-2 text-right text-side-a">{row.won}</td>
                  <td className="hidden p-2 text-right text-xs text-dim sm:table-cell">
                    {row.won}–{row.lost}
                    {row.drawn ? `–${row.drawn}` : ''}
                    <span className="text-faint"> / {row.battles}</span>
                  </td>
                  <td className="p-2 text-right text-xs text-dim">{Math.round(winRate(row) * 100)}%</td>
                  <td className="hidden p-2 text-right text-xs text-info sm:table-cell">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {footer && standings.length > shown.length ? (
            <Link to="/leaderboard" className="eyebrow mt-2 inline-flex items-center gap-1 text-info hover:text-parchment">
              Full leaderboard <ChevronRight className="size-3.5" />
            </Link>
          ) : null}
        </>
      ) : (
        <p className="mt-2 border border-edge bg-sunken p-4 text-sm text-dim">{blank}</p>
      )}
    </section>
  )
}

/**
 * The home page's look at the leaderboard: who leads each table, and nothing else.
 *
 * Three numbers rather than three tables. The home page is a place to notice that
 * a leaderboard exists and that somebody is winning it, and a young instance has
 * a leader long before it has a table worth scrolling — so this reads the same
 * whether it was folded from four battles or four hundred.
 */
export function StandingsGlimpse({ tables }: { tables: Record<StandingSubject, readonly Standing[]> }) {
  const leaders = (Object.keys(SUBJECTS) as StandingSubject[]).map((subject) => ({ subject, leader: tables[subject][0] }))
  if (!leaders.some(({ leader }) => leader)) {
    return (
      <section data-standings-empty>
        <p className="rubric border-b border-edge pb-2">Leading</p>
        <p className="mt-2 flex items-start gap-3 border border-edge bg-panel p-5 text-sm text-dim">
          <Trophy className="mt-0.5 size-5 shrink-0 text-parchment" aria-hidden />
          <span>No battles have finished yet. Every battle counts once it ends, and battles against a practice opponent are left out.</span>
        </p>
      </section>
    )
  }
  return (
    <section data-standings-glimpse>
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>Leading</span>
        <Link to="/leaderboard" className="inline-flex items-center gap-1 text-info hover:text-parchment">
          Full leaderboard <ChevronRight className="size-3.5" />
        </Link>
      </p>
      <div className="mt-2 grid gap-px border border-edge bg-edge sm:grid-cols-3">
        {leaders.map(({ subject, leader }) => (
          <article key={subject} className="min-w-0 bg-panel p-3">
            <p className="eyebrow text-faint">{SUBJECTS[subject].column}</p>
            {leader ? (
              <>
                <p className="mt-1 truncate font-bold uppercase">{leader.name}</p>
                <p className="mt-0.5 text-xs text-dim">
                  <span className="text-side-a">{leader.won} won</span> of {leader.battles} · {Math.round(winRate(leader) * 100)}%
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-faint">Nothing yet</p>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
