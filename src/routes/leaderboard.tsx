import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { STANDING_SUBJECTS } from '../core/standings'
import { Standings } from '../client/components/Standings'
import { formatDate } from '../client/dates'
import { standingsQuery } from '../client/queries'

export const Route = createFileRoute('/leaderboard')({
  loader: ({ context }) => context.queryClient.ensureQueryData(standingsQuery()),
  component: Leaderboard,
})

/**
 * Every player the standings know about.
 *
 * The whole table, because it is already folded and held by the time this page
 * asks: paging it would be a second request for rows the server computed anyway.
 */
function Leaderboard() {
  const { data } = useQuery(standingsQuery())
  return (
    <main className="w-full">
      <section className="relative overflow-hidden border-b border-edge bg-panel">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_35%,color-mix(in_srgb,var(--color-parchment)_8%,transparent),transparent_75%)]" />
        <div className="relative mx-auto max-w-5xl px-3 py-5 sm:px-4 sm:py-7">
          <p className="eyebrow text-parchment">Standings</p>
          <h1 className="mt-1 text-3xl">Leaderboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-dim">
            Folded from every finished battle anyone may watch{data ? ` since ${formatDate(data.since)}` : ''}. The same battles counted
            three ways: for the players, for the factions they fielded, and for the detachments they were built around. A concession is a
            loss whatever the points said. Battles against a practice opponent, and battles their players keep to themselves, are left out.
          </p>
        </div>
      </section>
      <div className="mx-auto max-w-5xl space-y-6 px-3 py-6 sm:px-4">
        {data ? STANDING_SUBJECTS.map((subject) => <Standings key={subject} standings={data[subject]} subject={subject} />) : null}
      </div>
    </main>
  )
}
