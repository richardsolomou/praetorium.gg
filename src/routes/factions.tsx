import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { factionsQuery, unitsQuery } from '../client/queries'

export const Route = createFileRoute('/factions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(factionsQuery()),
  component: Factions,
})

function Factions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data } = useSuspenseQuery(factionsQuery())
  const [selected, setSelected] = useState('')
  const [query, setQuery] = useState('')
  const { data: units = [] } = useQuery(unitsQuery(selected, query))

  if (path !== '/factions') return <Outlet />

  if (!data) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-dim">Catalogue data is still syncing.</main>
  const faction = data.factions.find((entry) => entry.id === selected)

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-8 md:grid-cols-[18rem_1fr]">
      <section>
        <p className="eyebrow">11th edition</p>
        <h1 className="text-2xl">Factions</h1>
        <div className="mt-4 divide-y divide-edge border border-edge bg-panel">
          {data.factions.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm font-semibold uppercase hover:text-azure ${selected === entry.id ? 'text-azure' : ''}`}
              onClick={() => setSelected(entry.id)}
            >
              {entry.name}
            </button>
          ))}
        </div>
      </section>
      <section className="min-w-0">
        {faction ? (
          <>
            <p className="eyebrow">{faction.detachments.length} detachments</p>
            <h2 className="text-2xl">{faction.name}</h2>
            <Input
              className="mt-4"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find a datasheet"
              aria-label="Find a datasheet"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {units.map((unit) => (
                <Link
                  key={unit.id}
                  to="/factions/$catalogueId/$entryId"
                  params={{ catalogueId: selected, entryId: unit.id }}
                  className="flex items-center justify-between border border-edge bg-panel px-3 py-2 hover:border-azure"
                >
                  <span className="truncate text-sm font-bold uppercase">{unit.name}</span>
                  {unit.points === null ? null : <span className="chip shrink-0">{unit.points} pts</span>}
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-10 text-sm text-dim">Choose a faction to browse its datasheets.</p>
        )}
      </section>
    </main>
  )
}
