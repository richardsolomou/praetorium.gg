import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { ChevronRight, Heart } from 'lucide-react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Toggle } from '@/components/ui/toggle'
import { factionIndexQuery, meQuery } from '../client/queries'
import { useFavouriteFactions } from '../client/favouriteFactions'
import { FactionMark, factionColour } from '../client/components/FactionMark'

export const Route = createFileRoute('/factions')({
  loader: ({ context, location }) =>
    location.pathname === '/factions' ? context.queryClient.ensureQueryData(factionIndexQuery()) : undefined,
  component: Factions,
})

function Factions() {
  const path = useRouterState({ select: (state) => state.location.pathname })
  if (path !== '/factions') return <Outlet />
  return <FactionIndex />
}

function FactionIndex() {
  const { data } = useQuery(factionIndexQuery())
  const { data: me } = useQuery(meQuery())
  const [factionQueryText, setFactionQueryText] = useState('')
  const { favourites, toggleFavourite } = useFavouriteFactions()
  if (!data) return <main className="mx-auto max-w-5xl px-4 py-8 text-sm text-dim">Catalogue data is still syncing.</main>

  const wanted = factionQueryText.trim().toLowerCase()
  const matching = data.factions.filter(
    (entry) => entry.displayName.toLowerCase().includes(wanted) || entry.name.toLowerCase().includes(wanted),
  )
  const favouriteFactions = matching.filter((entry) => favourites.has(entry.id))
  const groups = matching.reduce((grouped, entry) => {
    const title = entry.name.split(' - ')[0] || 'Other'
    grouped.set(title, [...(grouped.get(title) ?? []), entry])
    return grouped
  }, new Map<string, Faction[]>())

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <Input
        value={factionQueryText}
        onChange={(event) => setFactionQueryText(event.target.value)}
        placeholder="Find a faction"
        aria-label="Find a faction"
      />
      <FactionShelf title="Favourites" entries={favouriteFactions} favourites={favourites} onFavourite={me ? toggleFavourite : undefined} />
      {matching.length ? (
        [...groups.entries()]
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([title, entries]) => (
            <FactionShelf
              key={title}
              title={title}
              entries={entries}
              favourites={favourites}
              onFavourite={me ? toggleFavourite : undefined}
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
  icon: string | null
  references: { id: string; name: string; datasheets: number; detachments: number }[]
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
  onFavourite?: (id: string) => void
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
            <div
              key={entry.id}
              data-faction={entry.displayName}
              className="flex items-center border-l-2"
              style={{ borderLeftColor: factionColour(entry.slug) }}
            >
              <Link
                to="/factions/$catalogueId"
                params={{ catalogueId: entry.slug }}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
              >
                <FactionMark id={entry.slug} icon={entry.icon} />
                <span className="min-w-0">
                  <span className="block truncate font-bold uppercase">{entry.displayName}</span>
                  <span className="text-xs text-dim">{entry.references[0]?.detachments ?? 0} detachments</span>
                </span>
              </Link>
              {onFavourite ? (
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
              ) : (
                <Link
                  to="/signin"
                  search={{ next: '/factions' }}
                  className="m-1 grid size-7 place-items-center"
                  aria-label={`Sign in to add ${entry.displayName} to favourites`}
                >
                  <Heart className="size-4 text-dim" />
                </Link>
              )}
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
