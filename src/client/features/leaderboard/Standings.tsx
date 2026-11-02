import { Link, useNavigate } from '@tanstack/react-router'
import type { Standing, StandingFaction } from '../../../core/standings'
import { averagePoints, isProvisional, PROVISIONAL_BATTLES, winRate } from '../../../core/standings'
import { PlayerAvatar } from '../../components/PlayerAvatar'
import { SearchableSelect } from '../../components/SearchableSelect'
import { countLabel, percentLabel } from '../../text'
import { SectionHeading } from '../../components/SectionHeading'

/** One table of players: everybody, or everybody who has fielded one faction. */
export type StandingsTable = { faction: StandingFaction | null; players: number; rows: readonly Standing[] }

/**
 * A table of players, best first. Every name opens the player it belongs to.
 *
 * `Rating` is what the order is taken from, so a reader can check the ranking
 * against the row instead of trusting it. The record beside it is the context:
 * what the rating was earned from, and the points a battle the player scores.
 * A phone folds the record into a line under the name, short of the average
 * victory points, so the table never has to scroll sideways.
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
  const ranked = table.rows.filter((row) => !isProvisional(row))
  const unranked = table.rows.filter(isProvisional)
  const player = (row: Standing) => (
    <td className="overflow-hidden px-2 py-2.5 sm:px-3">
      <Link to="/users/$userId" params={{ userId: row.id }} className="group flex min-w-0 items-center gap-2.5">
        <PlayerAvatar name={row.name} image={row.image} className="size-7 shrink-0 text-3xs" />
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2.5 group-hover:text-parchment">
            <span className="truncate text-[0.9375rem] font-bold">{row.name}</span>
            {row.id === viewerId ? (
              <span className="shrink-0 rounded-md bg-parchment px-1.5 py-px text-2xs font-bold tracking-label text-parchment-ink uppercase">
                You
              </span>
            ) : null}
          </span>
          <span className="readout mt-0.5 block truncate text-xs text-dim sm:hidden">
            {[countLabel(row.won, 'win'), countLabel(row.battles, 'battle'), percentLabel(winRate(row))].join(' · ')}
          </span>
        </span>
      </Link>
    </td>
  )
  const record = (row: Standing) => (
    <>
      <td className={RECORD_CELL}>{row.won}</td>
      <td className={RECORD_CELL}>{row.battles}</td>
      <td className={RECORD_CELL}>{percentLabel(winRate(row))}</td>
      <td className={RECORD_CELL}>{Math.round(averagePoints(row))}</td>
    </>
  )
  return (
    <section data-standings>
      <SectionHeading title={title} count={table.players} />
      {table.rows.length ? (
        <div className="part overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-sm sm:min-w-xl">
            <thead>
              <tr className="border-b-2 border-runner text-left text-2xs tracking-eyebrow text-dim uppercase">
                <th scope="col" className="w-11 py-3 pr-1 pl-3 font-semibold sm:w-14 sm:px-3">
                  #
                </th>
                <th scope="col" className="px-2 py-3 font-semibold sm:px-3">
                  Player
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-right font-semibold">
                  Rating
                </th>
                <th scope="col" className="w-16 px-3 py-3 text-right font-semibold max-sm:hidden">
                  Wins
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-right font-semibold max-sm:hidden">
                  Battles
                </th>
                <th scope="col" className="w-16 px-3 py-3 text-right font-semibold max-sm:hidden">
                  Rate
                </th>
                <th scope="col" className="w-20 px-3 py-3 text-right font-semibold max-sm:hidden">
                  Avg VP
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, place) => (
                <tr
                  key={row.id}
                  data-standing={row.id}
                  className={`border-b border-edge transition-colors last:border-0 hover:bg-raised/60 ${row.id === viewerId ? 'bg-parchment/10' : ''}`}
                >
                  <td className="py-2.5 pr-1 pl-3 sm:px-3">
                    <span className={`part-tag ${place === 0 ? 'bg-parchment text-parchment-ink' : ''}`}>{place + 1}</span>
                  </td>
                  {player(row)}
                  <td className="readout px-3 py-2.5 text-right font-bold text-bone">{row.rating}</td>
                  {record(row)}
                </tr>
              ))}
            </tbody>
            {unranked.length ? (
              <tbody data-unranked>
                <tr className="border-y-2 border-runner bg-sunken">
                  <th
                    scope="rowgroup"
                    colSpan={7}
                    className="px-3 py-2.5 text-left text-2xs font-semibold tracking-eyebrow text-dim uppercase"
                  >
                    Not yet ranked · fewer than {PROVISIONAL_BATTLES} battles
                  </th>
                </tr>
                {unranked.map((row) => (
                  <tr
                    key={row.id}
                    data-standing={row.id}
                    className={`border-b border-edge last:border-0 ${row.id === viewerId ? 'bg-parchment/10' : ''}`}
                  >
                    <td className="py-2.5 pr-1 pl-3 sm:px-3">
                      <span className="part-tag part-tag-ghost">—</span>
                    </td>
                    {player(row)}
                    <td className="readout px-3 py-2.5 text-right text-faint">—</td>
                    {record(row)}
                  </tr>
                ))}
              </tbody>
            ) : null}
          </table>
        </div>
      ) : (
        <p className="part px-4 py-6 text-sm text-dim">{empty}</p>
      )}
    </section>
  )
}

const RECORD_CELL = 'readout px-3 py-2.5 text-right text-bone/85 max-sm:hidden'

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
