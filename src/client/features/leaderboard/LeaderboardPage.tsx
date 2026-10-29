import { useQuery } from '@tanstack/react-query'
import { PageContent, PageHeader } from '../../components/Page'
import { FactionFilter, Standings } from './Standings'
import { meQuery, standingsQuery } from '../../queries'

const EMPTY = { faction: null, players: 0, rows: [] }

/**
 * Who is winning, overall or with one faction.
 *
 * The faction is a search parameter rather than component state so a table has an
 * address: "the best Necrons players here" is a link somebody can send.
 */
export function LeaderboardPage({ faction }: { faction?: string }) {
  const { data } = useQuery(standingsQuery())
  const { data: me } = useQuery(meQuery())
  const chosen = data?.factions.find((table) => table.faction?.slug === faction)
  // An address that names a faction nobody has played falls back to everyone
  // rather than an empty page insisting the faction does not exist.
  const table = chosen ?? data?.overall ?? EMPTY
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Who is winning"
        title="Leaderboard"
        description={`Everyone with a public battle in the last ${data?.days ?? 90} days, ranked by rating.`}
        actions={<FactionFilter factions={data?.factions.map((entry) => entry.faction) ?? []} selected={chosen?.faction?.slug} />}
      />
      <PageContent className="space-y-6">
        <Standings table={table} viewerId={me?.id} />
        {/* Under the table, because it answers "why is my game not here" rather than "what am I reading". */}
        <p className="text-sm text-faint">
          Everyone starts at 1000, and beating a higher-rated player gains more. A rating counts every public battle, not only recent ones.
          A concession is a loss, and allies share their side's result, rated on their average. Practice, guest, private and manually
          tracked battles do not count.
        </p>
      </PageContent>
    </main>
  )
}
