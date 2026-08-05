import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { factionsQuery, unitsQuery } from '../client/queries'

export const Route = createFileRoute('/factions/$catalogueId/reference/datasheets')({
  loader: async ({ context, params }) => {
    const data = await context.queryClient.ensureQueryData(factionsQuery())
    if (!data?.factions.some((faction) => faction.id === params.catalogueId)) throw notFound()
  },
  component: DatasheetsPage,
})

function DatasheetsPage() {
  const { catalogueId } = Route.useParams()
  const { data } = useSuspenseQuery(factionsQuery())
  const faction = data?.factions.find((entry) => entry.id === catalogueId)
  const [query, setQuery] = useState('')
  const { data: units = [] } = useQuery(unitsQuery(catalogueId, query))
  if (!faction) return null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link
        to="/factions/$catalogueId/reference"
        params={{ catalogueId }}
        className="eyebrow flex items-center gap-1 text-azure hover:text-bone"
      >
        <ChevronLeft className="size-3.5" /> {faction.references[0]?.name ?? faction.name}
      </Link>
      <header className="mt-4 border-b border-edge pb-4">
        <p className="eyebrow">Reference</p>
        <h1 className="text-3xl">Datasheets</h1>
      </header>
      <Input
        className="mt-5"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Find a datasheet"
        aria-label="Find a datasheet"
      />
      <p className="rubric mt-5 flex items-baseline justify-between border-b border-edge pb-2">
        <span>Datasheets</span>
        <span className="readout">{faction.references[0]?.datasheets ?? units.length}</span>
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {units.map((unit) => (
          <Link
            key={unit.id}
            to="/factions/$catalogueId/$entryId"
            params={{ catalogueId, entryId: unit.id }}
            className="flex items-center justify-between border border-edge bg-panel px-3 py-2 hover:border-azure"
          >
            <span className="truncate text-sm font-bold uppercase">{unit.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              {unit.points === null ? null : <span className="chip">{unit.points} pts</span>}
              <ChevronRight className="size-4 text-dim" aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </main>
  )
}
