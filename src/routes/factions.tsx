import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Heart } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { factionsQuery } from '../client/queries'
import { favouritesFirst, useFavouriteFactions } from '../client/favouriteFactions'

export const Route = createFileRoute('/factions')({
  loader: ({ context }) => context.queryClient.ensureQueryData(factionsQuery()),
  component: Factions,
})

function Factions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  const { data } = useQuery(factionsQuery())
  const [factionQueryText, setFactionQueryText] = useState('')
  const { favourites, toggleFavourite } = useFavouriteFactions()

  if (path !== '/factions') return <Outlet />
  if (!data) return <main className="mx-auto max-w-4xl px-4 py-8 text-sm text-dim">Catalogue data is still syncing.</main>

  const wanted = factionQueryText.trim().toLowerCase()
  const matching = data.factions.filter(
    (entry) => entry.displayName.toLowerCase().includes(wanted) || entry.name.toLowerCase().includes(wanted),
  )
  const groups = matching.reduce((grouped, entry) => {
    const title = entry.name.split(' - ')[0] || 'Other'
    grouped.set(title, [...(grouped.get(title) ?? []), entry])
    return grouped
  }, new Map<string, Faction[]>())

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Input
        value={factionQueryText}
        onChange={(event) => setFactionQueryText(event.target.value)}
        placeholder="Find a faction"
        aria-label="Find a faction"
      />
      {matching.length ? (
        [...groups.entries()]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([title, entries]) => (
            <FactionShelf
              key={title}
              title={title}
              entries={favouritesFirst(entries, favourites)}
              favourites={favourites}
              onFavourite={toggleFavourite}
            />
          ))
      ) : (
        <p className="mt-6 border border-edge bg-panel p-6 text-center text-sm text-dim">No factions match.</p>
      )}
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
    reference: { enhancements: number; upgrades: number; stratagems: number; points: number | null; dispositions: string[] } | null
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
              <Toggle
                variant="default"
                size="sm"
                className="m-1 size-7 bg-transparent p-0"
                aria-label={`${favourites.has(entry.id) ? 'Remove' : 'Add'} ${entry.displayName} ${favourites.has(entry.id) ? 'from' : 'to'} favourites`}
                pressed={favourites.has(entry.id)}
                onPressedChange={() => onFavourite(entry.id)}
              >
                <Heart className={`size-4 ${favourites.has(entry.id) ? 'fill-azure text-azure' : 'text-dim'}`} />
              </Toggle>
              <ChevronRight className="mr-2 size-4 text-dim" aria-hidden />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-dim">No factions match.</p>
      )}
    </section>
  )
}
