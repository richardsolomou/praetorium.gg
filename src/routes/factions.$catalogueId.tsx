import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    if (!data?.factions.some((faction) => faction.id === params.catalogueId)) throw notFound()
  },
  component: FactionPage,
})

function FactionPage() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { catalogueId } = Route.useParams()
  const { data } = useSuspenseQuery(factionsQuery())
  if (path !== `/factions/${catalogueId}`) return <Outlet />
  const faction = data?.factions.find((entry) => entry.id === catalogueId)
  if (!faction) return null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link to="/factions" className="eyebrow flex items-center gap-1 text-azure hover:text-bone">
        <ChevronLeft className="size-3.5" /> All factions
      </Link>
      <header className="mt-4 border-b border-edge pb-4">
        <p className="eyebrow">11th edition · {faction.detachments.length} detachments</p>
        <h1 className="text-3xl">{faction.name}</h1>
      </header>
      <section className="mt-5">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>References</span>
          <span className="readout">{faction.references.length}</span>
        </p>
        <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
          {faction.references.map((reference) => (
            <Link
              key={reference.id}
              to="/factions/$catalogueId/reference"
              params={{ catalogueId }}
              className="flex items-center justify-between gap-4 px-3 py-3 hover:bg-raised"
            >
              <span>
                <span className="block font-bold uppercase">{reference.name}</span>
                <span className="text-xs text-dim">
                  {reference.datasheets} datasheets · {reference.detachments} detachments
                </span>
              </span>
              <ChevronRight className="size-4 text-dim" aria-hidden />
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
