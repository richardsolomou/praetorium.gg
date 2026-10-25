import { Link } from '@tanstack/react-router'
import type { LeagueResult } from '../../../core/leagueResults'
import type { LeagueEntryView } from '../../../core/league'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SectionHeading } from './LeagueEntrants'

/**
 * An event's table from its finished battles: wins, then draws, then victory points.
 *
 * Narrow columns let a phone show every one; anything narrower still scrolls inside the frame, as the leaderboard does.
 */
export function LeagueResults({
  rows,
  partial,
  entries,
  label,
}: {
  rows: readonly LeagueResult[]
  partial: boolean
  entries: readonly LeagueEntryView[]
  label: (entry: LeagueEntryView) => string
}) {
  const people = new Map(entries.map((entry) => [entry.userId, entry]))
  return (
    <section data-league-results>
      <SectionHeading title="Results" />
      <div className="overflow-x-auto border border-edge bg-panel">
        <table className="w-full min-w-72 table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-edge text-left text-xs tracking-wide text-faint uppercase">
              <th scope="col" className="w-8 px-2 py-3 font-normal sm:w-10 sm:px-3">
                #
              </th>
              <th scope="col" className="px-2 py-3 font-normal sm:px-3">
                Player
              </th>
              {COLUMNS.map((column) => (
                <th key={column.key} scope="col" className="w-9 px-1 py-3 text-right font-normal sm:w-12 sm:px-3">
                  <abbr title={column.title} className="no-underline">
                    {column.short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, place) => {
              const entry = people.get(row.userId)
              if (!entry) return null
              return (
                <tr key={row.userId} data-result={entry.name} className="border-b border-edge last:border-0">
                  <td className={`readout px-2 py-3 sm:px-3 ${place === 0 && row.played ? 'font-bold text-parchment' : 'text-faint'}`}>
                    {place + 1}
                  </td>
                  <td className="overflow-hidden px-2 py-3 sm:px-3">
                    <Link to="/users/$userId" params={{ userId: row.userId }} className="flex min-w-0 items-center gap-2 hover:text-info">
                      <PlayerAvatar name={entry.name} image={entry.image} className="size-7 text-3xs max-sm:hidden" />
                      <span className="truncate font-bold uppercase">{label(entry)}</span>
                    </Link>
                  </td>
                  {COLUMNS.map((column) => (
                    <td key={column.key} className={`readout px-1 py-3 text-right sm:px-3 ${row[column.key] ? column.tint : 'text-faint'}`}>
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {partial ? <p className="mt-2 text-xs text-dim">Counts this tournament’s latest 500 battles.</p> : null}
    </section>
  )
}

/** Each column in the tint its outcome reads in elsewhere: wins green, losses rust, victory points as a score. */
const COLUMNS = [
  { key: 'played', short: 'P', title: 'Played', tint: 'text-dim' },
  { key: 'won', short: 'W', title: 'Won', tint: 'text-achieved' },
  { key: 'drawn', short: 'D', title: 'Drawn', tint: 'text-dim' },
  { key: 'lost', short: 'L', title: 'Lost', tint: 'text-rust' },
  { key: 'points', short: 'VP', title: 'Victory points', tint: 'text-info' },
] as const
