import { useQuery } from '@tanstack/react-query'
import { PageContent, PageHeader } from '../../components/Page'
import { FactionFilter, Standings } from './Standings'
import { standingsQuery } from '../../queries'

const EMPTY = { faction: null, players: 0, rows: [] }

/**
 * Who is winning, overall or with one faction.
 *
 * The faction is a search parameter rather than component state so a table has an
 * address: "the best Necrons players here" is a link somebody can send.
 */
export function LeaderboardPage({ faction }: { faction?: string }) {
  const { data } = useQuery(standingsQuery())
  const chosen = data?.factions.find((table) => table.faction?.slug === faction)
  // An address that names a faction nobody has played falls back to everyone
  // rather than an empty page insisting the faction does not exist.
  const table = chosen ?? data?.overall ?? EMPTY
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Who is winning"
        title="Leaderboard"
        description={`Public battles from the last ${data?.days ?? 90} days, ranked by wins and then win rate.`}
      />
      <PageContent className="space-y-6">
        <FactionFilter factions={data?.factions.map((entry) => entry.faction) ?? []} selected={chosen?.faction?.slug} />
        <Standings table={table} />
        {/* Under the table, because it answers "why is my game not here" rather than "what am I reading". */}
        <p className="text-sm text-faint">
          Conceding is a loss whatever the score. Allies share their side's result. Practice games and battles kept private are not counted.
        </p>
      </PageContent>
    </main>
  )
}
