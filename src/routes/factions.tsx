import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Heart } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { factionsQuery } from '../client/queries'

export const Route = createFileRoute('/factions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(factionsQuery()),
  component: Factions,
})

const FAVOURITES = 'praetorium:favourite-factions'

function Factions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data } = useQuery(factionsQuery())
  const [factionQueryText, setFactionQueryText] = useState('')
  const [favourites, setFavourites] = useState<Set<string>>(new Set())

  useEffect(() => {
    const stored = localStorage.getItem(FAVOURITES)
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (Array.isArray(parsed)) setFavourites(new Set(parsed.filter((value): value is string => typeof value === 'string')))
    }
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
  const wanted = factionQueryText.trim().toLowerCase()
  const matching = data.factions.filter(
    (entry) => entry.displayName.toLowerCase().includes(wanted) || entry.name.toLowerCase().includes(wanted),
  )
  const favouriteFactions = matching.filter((entry) => favourites.has(entry.id))

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Input
        value={factionQueryText}
        onChange={(event) => setFactionQueryText(event.target.value)}
        placeholder="Find a faction"
        aria-label="Find a faction"
      />
      <FactionShelf title="Favourites" entries={favouriteFactions} favourites={favourites} onFavourite={toggleFavourite} />
      <FactionShelf title="All factions" entries={matching} favourites={favourites} onFavourite={toggleFavourite} />
    </main>
  )
}

type Faction = {
  id: string
  slug: string
  name: string
  displayName: string
  references: { id: string; name: string; datasheets: number; detachments: number }[]
  detachments: {
    id: string
    name: string
    reference: { enhancements: number; stratagems: number; points: number | null; dispositions: string[] } | null
  }[]
}

function FactionShelf({
  title,
  entries,
  favourites,
  onFavourite,
}: {
  title: string
  entries: Faction[]
  favourites: Set<string>
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
            <div key={entry.id} data-faction={entry.displayName} className="flex items-center">
              <Link to="/factions/$catalogueId" params={{ catalogueId: entry.slug }} className="min-w-0 flex-1 px-3 py-2 text-left">
                <span className="block truncate font-bold uppercase">{entry.displayName}</span>
                <span className="text-xs text-dim">{entry.detachments.length} detachments</span>
              </Link>
              <Button
                variant="ghost"
                size="icon-sm"
                className="m-1"
                aria-label={`${favourites.has(entry.id) ? 'Remove' : 'Add'} ${entry.displayName} ${favourites.has(entry.id) ? 'from' : 'to'} favourites`}
                aria-pressed={favourites.has(entry.id)}
                onClick={() => onFavourite(entry.id)}
              >
                <Heart className={`size-4 ${favourites.has(entry.id) ? 'fill-azure text-azure' : 'text-dim'}`} />
              </Button>
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
