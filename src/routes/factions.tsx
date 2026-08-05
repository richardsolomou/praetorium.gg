import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { factionsQuery, unitsQuery } from '../client/queries'

export const Route = createFileRoute('/factions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(factionsQuery()),
  component: Factions,
})

const FAVOURITES = 'praetorium:favourite-factions'

function Factions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data } = useSuspenseQuery(factionsQuery())
  const [selected, setSelected] = useState('')
  const [factionQueryText, setFactionQueryText] = useState('')
  const [unitQueryText, setUnitQueryText] = useState('')
  const [favourites, setFavourites] = useState<Set<string>>(new Set())
  const { data: units = [] } = useQuery(unitsQuery(selected, unitQueryText))

  useEffect(() => {
    const stored = localStorage.getItem(FAVOURITES)
    if (stored) setFavourites(new Set(JSON.parse(stored) as string[]))
  }, [])

  if (path !== '/factions') return <Outlet />
  if (!data) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-dim">Catalogue data is still syncing.</main>

  const toggleFavourite = (id: string) => {
    setFavourites((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      localStorage.setItem(FAVOURITES, JSON.stringify([...next]))
      return next
    })
  }
  const faction = data.factions.find((entry) => entry.id === selected)

  if (faction) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <button type="button" className="eyebrow flex items-center gap-1 text-azure hover:text-bone" onClick={() => setSelected('')}>
          <ChevronLeft className="size-3.5" /> All factions
        </button>
        <div className="mt-4 flex items-start justify-between gap-4 border-b border-edge pb-4">
          <div>
            <p className="eyebrow">11th edition · {faction.detachments.length} detachments</p>
            <h1 className="text-3xl">{faction.name}</h1>
          </div>
          <button
            type="button"
            className="p-2"
            aria-label={`${favourites.has(faction.id) ? 'Remove' : 'Add'} ${faction.name} ${favourites.has(faction.id) ? 'from' : 'to'} favourites`}
            aria-pressed={favourites.has(faction.id)}
            onClick={() => toggleFavourite(faction.id)}
          >
            <Heart className={`size-5 ${favourites.has(faction.id) ? 'fill-azure text-azure' : 'text-dim'}`} />
          </button>
        </div>
        {faction.detachments.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {faction.detachments.map((detachment) => (
              <span key={detachment.id} className="chip">
                {detachment.name}
              </span>
            ))}
          </div>
        ) : null}
        <Input
          className="mt-5"
          value={unitQueryText}
          onChange={(event) => setUnitQueryText(event.target.value)}
          placeholder="Find a datasheet"
          aria-label="Find a datasheet"
        />
        <p className="rubric mt-5 flex items-baseline justify-between border-b border-edge pb-2">
          <span>Datasheets</span>
          <span className="readout">{units.length}</span>
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
      </main>
    )
  }

  const matching = data.factions.filter((entry) => entry.name.toLowerCase().includes(factionQueryText.trim().toLowerCase()))
  const favouriteFactions = matching.filter((entry) => favourites.has(entry.id))

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Input
        value={factionQueryText}
        onChange={(event) => setFactionQueryText(event.target.value)}
        placeholder="Find a faction"
        aria-label="Find a faction"
      />
      <FactionShelf
        title="Favourites"
        entries={favouriteFactions}
        favourites={favourites}
        onSelect={setSelected}
        onFavourite={toggleFavourite}
      />
      <FactionShelf title="All factions" entries={matching} favourites={favourites} onSelect={setSelected} onFavourite={toggleFavourite} />
    </main>
  )
}

type Faction = { id: string; name: string; detachments: { id: string; name: string }[] }

function FactionShelf({
  title,
  entries,
  favourites,
  onSelect,
  onFavourite,
}: {
  title: string
  entries: Faction[]
  favourites: Set<string>
  onSelect: (id: string) => void
  onFavourite: (id: string) => void
}) {
  return (
    <section data-shelf={title} className="mt-6">
      <p className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{entries.length}</span>
      </p>
      {entries.length ? (
        <div className="mt-2 divide-y divide-edge border border-edge bg-panel">
          {entries.map((entry) => (
            <div key={entry.id} data-faction={entry.name} className="flex items-center">
              <button type="button" className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => onSelect(entry.id)}>
                <span className="block truncate font-bold uppercase">{entry.name}</span>
                <span className="text-xs text-dim">{entry.detachments.length} detachments</span>
              </button>
              <button
                type="button"
                className="p-2"
                aria-label={`${favourites.has(entry.id) ? 'Remove' : 'Add'} ${entry.name} ${favourites.has(entry.id) ? 'from' : 'to'} favourites`}
                aria-pressed={favourites.has(entry.id)}
                onClick={() => onFavourite(entry.id)}
              >
                <Heart className={`size-4 ${favourites.has(entry.id) ? 'fill-azure text-azure' : 'text-dim'}`} />
              </button>
              <ChevronRight className="mr-2 size-4 text-dim" aria-hidden />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-dim">
          {title === 'Favourites' ? 'Tap a heart on a faction to add it here.' : 'No factions match.'}
        </p>
      )}
    </section>
  )
}
