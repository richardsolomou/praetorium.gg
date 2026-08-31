import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { FactionFilter, Standings } from '../client/components/Standings'
import { formatDate } from '../client/dates'
import { standingsQuery } from '../client/queries'

export const Route = createFileRoute('/leaderboard')({
  validateSearch: (search: Record<string, unknown>) => ({
    faction: typeof search.faction === 'string' && search.faction ? search.faction : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(standingsQuery()),
  component: Leaderboard,
})

/**
 * Who is winning, overall or with one faction.
 *
 * The faction is a search parameter rather than component state so a table has an
 * address: "the best Necrons players here" is a link somebody can send.
 */
function Leaderboard() {
  const { faction } = Route.useSearch()
  const { data } = useQuery(standingsQuery())
  const chosen = data?.factions.find((entry) => entry.id === faction)
  // An address that names a faction nobody has played falls back to everyone
  // rather than an empty page insisting the faction does not exist.
  const table = chosen ?? { name: 'Everyone', standings: data?.overall ?? [] }
  return (
    <main className="w-full">
      <section className="border-b border-edge bg-panel">
        <div className="mx-auto max-w-5xl px-3 py-5 sm:px-4">
          <p className="eyebrow text-parchment">Leaderboard</p>
          <h1 className="mt-1 text-3xl">Who is winning</h1>
          <p className="mt-2 max-w-2xl text-sm text-dim">
            Every finished battle anyone can watch{data ? `, since ${formatDate(data.since)}` : ''}. Conceding counts as a loss whatever the
            score was. Battles against a practice opponent do not count, and neither do battles their players keep private.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-6 px-3 py-8 sm:px-4">
        <FactionFilter factions={data?.factions ?? []} selected={chosen?.id} />
        <Standings standings={table.standings} heading={table.name} />
      </div>
    </main>
  )
}
