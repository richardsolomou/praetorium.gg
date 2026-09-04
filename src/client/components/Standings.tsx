import { Link, useNavigate } from '@tanstack/react-router'
import type { Standing, StandingFaction } from '../../core/standings'
import { winRate } from '../../core/standings'
import { PlayerAvatar } from './PlayerAvatar'
import { SearchableSelect } from './SearchableSelect'

/** One table of players: everybody, or everybody who has fielded one faction. */
export type StandingsTable = { faction: StandingFaction | null; players: number; rows: readonly Standing[] }

/**
 * A table of players, best first. Every name opens the player it belongs to.
 *
 * `Wins` and `Rate` are the two the order is taken from, in that order, so a
 * reader can check the ranking against the row instead of trusting it. `Battles`
 * and `VP` are the context: how much a player has played, and everything they
 * scored doing it. Every width shows all of them.
 */
export function Standings({ table }: { table: StandingsTable }) {
  return (
    <section data-standings>
      <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{table.faction?.displayName ?? 'Everyone'}</span>
        <span className="readout">{table.players}</span>
      </h2>
      {table.rows.length ? (
        /*
          The table scrolls inside this rather than dropping columns on a narrow
          screen: every column is worth reading, and a reader who wants the rest
          swipes for it. The scroll has to be the pane's, so `min-w` sets the width
          the columns need and the wrapper keeps that off the document — a table
          that widens the page is the one thing on here that pushes a phone sideways.
        */
        <div className="mt-2 overflow-x-auto border border-edge bg-panel">
          <table className="w-full min-w-2xl table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-edge text-left text-xs tracking-wide text-faint uppercase">
                <th scope="col" className="w-12 p-3 font-normal">
                  #
                </th>
                <th scope="col" className="p-3 font-normal">
                  Player
                </th>
                <th scope="col" className="w-16 p-3 text-right font-normal">
                  Wins
                </th>
                <th scope="col" className="w-20 p-3 text-right font-normal">
                  Battles
                </th>
                <th scope="col" className="w-16 p-3 text-right font-normal">
                  Rate
                </th>
                <th scope="col" className="w-16 p-3 text-right font-normal">
                  VP
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, place) => (
                <tr key={row.id} data-standing={row.id} className="border-b border-edge last:border-0">
                  <td className="readout p-3 text-faint">{place + 1}</td>
                  <td className="overflow-hidden p-3">
                    <Link to="/users/$userId" params={{ userId: row.id }} className="flex min-w-0 items-center gap-2 hover:text-info">
                      <PlayerAvatar name={row.name} image={row.image} className="size-7 text-xs" />
                      <span className="truncate font-bold uppercase">{row.name}</span>
                    </Link>
                  </td>
                  <td className="readout p-3 text-right text-bone">{row.won}</td>
                  <td className="readout p-3 text-right text-dim">{row.battles}</td>
                  <td className="readout p-3 text-right text-dim">{Math.round(winRate(row) * 100)}%</td>
                  <td className="readout p-3 text-right text-info">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-2 border border-edge bg-panel p-5 text-sm text-dim">Nobody has finished a public battle here yet.</p>
      )}
    </section>
  )
}

/** The value standing for the table with no faction filter on it. */
const EVERYONE = 'everyone'

/**
 * Which table to read: everybody, or everybody who has fielded one faction.
 *
 * Choosing navigates rather than holding the answer in state, so a faction's table
 * keeps an address somebody can send. A searchable list rather than a row of chips
 * because a busy instance has played dozens of factions, and dozens of chips is a
 * wall to read rather than a choice to make.
 */
export function FactionFilter({ factions, selected }: { factions: readonly StandingFaction[]; selected?: string }) {
  const navigate = useNavigate()
  if (!factions.length) return null
  return (
    <SearchableSelect
      ariaLabel="Faction"
      groups={[
        {
          label: '',
          items: [
            { label: 'Everyone', value: EVERYONE },
            ...factions.map((faction) => ({ label: faction.displayName, value: faction.slug, faction })),
          ],
        },
      ]}
      value={selected ?? EVERYONE}
      onValueChange={(chosen) => {
        void navigate({ to: '/leaderboard', search: { faction: chosen === EVERYONE ? undefined : chosen } })
      }}
      placeholder="Everyone"
      searchPlaceholder="Search factions…"
      className="h-10 w-full rounded-none border-edge bg-sunken text-sm font-semibold uppercase sm:w-72"
    />
  )
}
