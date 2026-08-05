import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { FileUp, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { savedRostersQuery } from '../client/queries'
import { GAME_SIZES } from '../core/battle'

type Search = { limit?: number }

export const Route = createFileRoute('/rosters/')({
  validateSearch: (search: Record<string, unknown>): Search => {
    const limit = Number(search.limit)
    return GAME_SIZES.some((size) => size.limit === limit) ? { limit } : {}
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(savedRostersQuery()),
  component: RosterLibrary,
})

function RosterLibrary() {
  const { data: saved = [] } = useQuery(savedRostersQuery())
  const { limit } = Route.useSearch()
  const shown = limit === undefined ? saved : saved.filter((roster) => roster.limit === limit)

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-4">
        <div>
          <p className="eyebrow">Your rosters</p>
          <h1 className="text-3xl">My rosters</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button render={<Link to="/rosters/import" />} variant="outline">
            <FileUp /> Import roster
          </Button>
          <Button render={<Link to="/rosters/new" />}>
            <Plus /> Create editable roster
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5" aria-label="Battle size filter">
        <span className="eyebrow mr-1">Battle size</span>
        <Button
          render={<Link to="/rosters" search={{}} />}
          variant="outline"
          size="xs"
          className={`chip ${limit === undefined ? 'border-azure text-azure' : ''}`}
        >
          All
        </Button>
        {GAME_SIZES.map((size) => (
          <Button
            key={size.limit}
            render={<Link to="/rosters" search={{ limit: size.limit }} />}
            variant="outline"
            size="xs"
            className={`chip ${limit === size.limit ? 'border-azure text-azure' : ''}`}
          >
            {size.name} · {size.limit}
          </Button>
        ))}
      </div>

      <section className="mt-4">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Rosters</span>
          <span className="readout">{shown.length}</span>
        </p>
        <div className="mt-2 space-y-2">
          {shown.length ? (
            shown.map((roster) => (
              <Link
                key={roster.id}
                to="/rosters/$id/edit"
                params={{ id: roster.id }}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border border-edge bg-panel p-3 text-left hover:border-azure"
              >
                <span>
                  <span className="block font-bold uppercase">{roster.name}</span>
                  <span className="text-xs text-dim">
                    {roster.picks.length} units · updated {new Date(roster.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="chip">{roster.limit} pts</span>
              </Link>
            ))
          ) : (
            <p className="border border-edge bg-panel p-8 text-center text-sm text-dim">
              {saved.length ? 'No rosters at this battle size.' : 'No rosters yet. Create one or bring one from another app.'}
            </p>
          )}
        </div>
      </section>
    </main>
  )
}
