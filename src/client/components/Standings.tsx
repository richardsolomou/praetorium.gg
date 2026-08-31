import { Link } from '@tanstack/react-router'
import type { Standing } from '../../core/standings'
import { winRate } from '../../core/standings'
import { PlayerAvatar } from './PlayerAvatar'

/**
 * A table of players, best first.
 *
 * Names are not linked. A profile is readable to a friend, or to someone who
 * shares or is watching a battle, and this table is read by people who are
 * neither, so a link from every row would be a page most readers cannot open.
 */
export function Standings({ standings, heading, limit }: { standings: readonly Standing[]; heading: string; limit?: number }) {
  const shown = limit === undefined ? standings : standings.slice(0, limit)
  return (
    <section data-standings>
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
                  Player
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
                      <PlayerAvatar name={row.name} className="size-6 text-[0.625rem]" />
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
        </>
      ) : (
        <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">
          No finished battles here yet. A player appears once a battle they were in ends.
        </p>
      )}
    </section>
  )
}

/**
 * Which table to read: everybody, or everybody who has fielded one faction.
 *
 * Links rather than a control, so a faction's table has an address somebody can
 * send. Only factions with a finished battle behind them are offered, so this
 * stays short on a young instance instead of listing a catalogue nobody has
 * played yet.
 */
export function FactionFilter({ factions, selected }: { factions: readonly { id: string; name: string }[]; selected?: string }) {
  if (!factions.length) return null
  return (
    <nav aria-label="Leaderboard faction" className="flex flex-wrap gap-1.5">
      <FilterLink name="Everyone" active={!selected} />
      {factions.map((faction) => (
        <FilterLink key={faction.id} name={faction.name} faction={faction.id} active={selected === faction.id} />
      ))}
    </nav>
  )
}

function FilterLink({ name, faction, active }: { name: string; faction?: string; active: boolean }) {
  return (
    <Link
      to="/leaderboard"
      search={{ faction }}
      aria-current={active ? 'page' : undefined}
      className={`chip border px-2.5 py-1 ${active ? 'border-parchment bg-raised text-bone' : 'border-edge bg-sunken text-dim hover:border-info hover:text-info'}`}
    >
      {name}
    </Link>
  )
}
