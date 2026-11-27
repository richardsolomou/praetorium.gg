import { Link, useNavigate } from '@tanstack/react-router'
import type { Standing, StandingFaction } from '../../../core/standings'
import { averagePoints, winRate } from '../../../core/standings'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { RankFigure } from '../../components/RankFigure'
import { SearchableSelect } from '../../components/SearchableSelect'
import { percentLabel } from '../../text'
import { SectionHeading } from '../../components/SectionHeading'
import { nameColour } from '../../playerName'

/** One table of players: everybody, or everybody who has fielded one faction. */
export type StandingsTable = { faction: StandingFaction | null; players: number; rows: readonly Standing[] }

/**
 * A table of players, best first. Every name opens the player it belongs to.
 *
 * `Rating` is what the order is taken from, so a reader can check the ranking
 * against the row instead of trusting it. The record beside it is the context:
 * what the rating was earned from, and the points a battle the player scores.
 * A phone scrolls the table sideways rather than dropping columns.
 *
 * Players without enough battles to rank follow under their own heading, with
 * neither a place nor a rating: a number there would read as a rank it is not.
 */
export function Standings({
  table,
  viewerId,
  title = table.faction?.displayName ?? 'Everyone',
  empty = 'Nobody has finished a public battle here yet.',
}: {
  table: StandingsTable
  viewerId?: string
  title?: string
  empty?: string
}) {
  const player = (row: Standing) => (
    <td className="overflow-hidden px-2 py-2.5 sm:px-3">
      <Link to="/users/$userId" params={{ userId: row.id }} className="group flex min-w-0 items-center gap-2.5">
        <PlayerAvatar name={row.name} image={row.image} className="size-7 shrink-0 text-3xs" />
        <span className="flex min-w-0 items-center gap-2.5 group-hover:text-parchment">
          <span className="truncate text-[0.9375rem] font-bold" style={nameColour(row)}>
            {row.name}
          </span>
          {row.id === viewerId ? <span className="shrink-0 text-xs font-medium text-parchment">You</span> : null}
        </span>
      </Link>
    </td>
  )
  const record = (row: Standing) => (
    <>
      <td className={RECORD_CELL}>{row.battles}</td>
      <td className={RECORD_CELL}>{percentLabel(winRate(row))}</td>
      <td className={RECORD_CELL}>{Math.round(averagePoints(row))}</td>
    </>
  )
  return (
    <section data-standings>
      <SectionHeading title={title} count={table.players} />
      {table.rows.length ? (
        <div className="overflow-x-auto border-y border-edge">
          <table className="w-full table-fixed border-collapse text-sm min-w-lg">
            <thead>
              <tr className="eyebrow border-b border-edge text-left text-dim">
                <th scope="col" className="w-12 py-2.5 pr-1 pl-2 font-bold sm:w-14 sm:px-3">
                  #
                </th>
                <th scope="col" className="px-2 py-2.5 font-bold sm:px-3">
                  Player
                </th>
                <th scope="col" className="w-20 px-3 py-2.5 text-right font-bold">
                  Rating
                </th>
                <th scope="col" className="w-20 px-3 py-2.5 text-right font-bold">
                  Battles
                </th>
                <th scope="col" className="w-16 px-3 py-2.5 text-right font-bold">
                  Rate
                </th>
                <th scope="col" className="w-20 px-3 py-2.5 text-right font-bold">
                  Avg VP
                </th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, place) => (
                <tr
                  key={row.id}
                  data-standing={row.id}
                  className={`border-b border-edge transition-colors last:border-0 hover:bg-raised ${row.id === viewerId ? 'bg-parchment/8' : ''}`}
                >
                  <td className="py-2.5 pr-1 pl-2 sm:px-3">
                    <RankFigure place={place + 1} />
                  </td>
                  {player(row)}
                  <td className="figure px-3 py-2.5 text-right text-xl leading-none text-bone">{row.rating}</td>
                  {record(row)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-y border-edge px-2 py-6 text-sm text-dim">{empty}</p>
      )}
    </section>
  )
}

const RECORD_CELL = 'readout px-3 py-2.5 text-right text-bone/85'

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
      className="w-72 max-w-full"
    />
  )
}
