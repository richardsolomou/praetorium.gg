import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, Outlet, useParams, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { factionFor } from '../factions'
import { factionDatasheetsQuery, factionsQuery } from '../queries'
import { FactionMark, factionColour } from './FactionMark'

export function FactionDatasheets() {
  const { catalogueId } = useParams({ strict: false })
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data } = useQuery(factionsQuery())
  const faction = factionFor(data, catalogueId ?? '')
  const [query, setQuery] = useState('')
  const { data: units = [] } = useQuery({ ...factionDatasheetsQuery(faction?.id ?? '', query), placeholderData: keepPreviousData })
  if (path !== `/factions/${catalogueId}/datasheets`) return <Outlet />
  if (!faction) return null

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Link
        to="/factions/$catalogueId"
        params={{ catalogueId: faction.slug }}
        className="eyebrow flex items-center gap-1 text-azure hover:text-bone"
      >
        <ChevronLeft className="size-3.5" /> {faction.references[0]?.name ?? faction.displayName}
      </Link>
      <header className="mt-4 flex items-center gap-3 border-b pb-4" style={{ borderBottomColor: factionColour(faction.slug) }}>
        <FactionMark id={faction.slug} icon={faction.icon} />
        <span>
          <p className="eyebrow">{faction.displayName} · Reference</p>
          <h1 className="text-3xl">Datasheets</h1>
        </span>
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
            to="/factions/$catalogueId/datasheets/$entryId"
            params={{ catalogueId: faction.slug, entryId: unit.slug }}
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
