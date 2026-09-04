import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FactionFilter, Standings } from '../client/components/Standings'
import { standingsQuery } from '../client/queries'

export const Route = createFileRoute('/leaderboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    faction: typeof search.faction === 'string' && search.faction ? search.faction : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(standingsQuery()),
  component: Leaderboard,
})

const EMPTY = { faction: null, players: 0, rows: [] }

/**
 * Who is winning, overall or with one faction.
 *
 * The faction is a search parameter rather than component state so a table has an
 * address: "the best Necrons players here" is a link somebody can send.
 */
function Leaderboard() {
  const { faction } = Route.useSearch()
  const { data } = useQuery(standingsQuery())
  const chosen = data?.factions.find((table) => table.faction?.slug === faction)
  // An address that names a faction nobody has played falls back to everyone
  // rather than an empty page insisting the faction does not exist.
  const table = chosen ?? data?.overall ?? EMPTY
  return (
    <main className="w-full">
      <section className="border-b border-edge bg-panel">
        <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4">
          <p className="eyebrow text-parchment">Who is winning</p>
          <h1 className="mt-1 text-3xl">Leaderboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-dim">
            Public battles from the last {data?.days ?? 90} days, ranked by wins and then win rate.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-6 px-3 py-8 sm:px-4">
        <FactionFilter factions={data?.factions.map((entry) => entry.faction) ?? []} selected={chosen?.faction?.slug} />
        <Standings table={table} />
        {/* Under the table, because it answers "why is my game not here" rather than "what am I reading". */}
        <p className="text-sm text-faint">
          Conceding is a loss whatever the score. Allies share their side's result. Practice games and battles kept private are not counted.
        </p>
      </div>
    </main>
  )
}
