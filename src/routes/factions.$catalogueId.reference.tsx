import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    if (!data?.factions.some((faction) => faction.id === params.catalogueId)) throw notFound()
  },
  component: ReferencePage,
})

function ReferencePage() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { catalogueId } = Route.useParams()
  const { data } = useSuspenseQuery(factionsQuery())
  if (path !== `/factions/${catalogueId}/reference`) return <Outlet />
  const faction = data?.factions.find((entry) => entry.id === catalogueId)
  if (!faction) return null
  const reference = faction.references[0]

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link to="/factions/$catalogueId" params={{ catalogueId }} className="eyebrow flex items-center gap-1 text-azure hover:text-bone">
        <ChevronLeft className="size-3.5" /> {faction.name}
      </Link>
      <header className="mt-4 border-b border-edge pb-4">
        <p className="eyebrow">Reference</p>
        <h1 className="text-3xl">{reference?.name ?? faction.name}</h1>
      </header>
      <section className="mt-5">
        <Link
          to="/factions/$catalogueId/reference/datasheets"
          params={{ catalogueId }}
          className="flex items-center justify-between border border-edge bg-panel px-3 py-3 hover:bg-raised"
        >
          <span className="font-bold uppercase">Datasheets</span>
          <span className="flex items-center gap-3">
            <span className="readout">{reference?.datasheets ?? 0}</span>
            <ChevronRight className="size-4 text-dim" aria-hidden />
          </span>
        </Link>
      </section>
      <section className="mt-6">
        <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
          <span>Detachments</span>
          <span className="readout">{faction.detachments.length}</span>
        </p>
        <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
          {faction.detachments.map((detachment) => (
            <div key={detachment.id} className="px-3 py-2 text-sm font-bold uppercase">
              {detachment.name}
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
