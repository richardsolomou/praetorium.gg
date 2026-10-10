import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Heart } from 'lucide-react'
import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { editionFamilyId, editionLabel } from '../../../../core/catalogueEdition'
import { factionIndexQuery, meQuery } from '../../../queries'
import { useFavouriteFactions } from '../../../favouriteFactions'
import { FactionMark, factionColour, type FactionPresentation } from '../../../components/FactionMark'
import { SearchField } from '../../../components/SearchField'
import { PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'

export function FactionIndexPage() {
  const { data } = useQuery(factionIndexQuery())
  const { data: me } = useQuery(meQuery())
  const [factionQueryText, setFactionQueryText] = useState('')
  const { favourites, toggleFavourite } = useFavouriteFactions()
  if (!data)
    return (
      <main className="flex w-full">
        <PageState
          className="flex-1 border-x-0 border-t-0"
          loading
          eyebrow="Factions"
          title="Getting army data ready"
          explanation="Faction rules, datasheets and points will be available shortly."
        />
      </main>
    )

  const wanted = factionQueryText.trim().toLowerCase()
  const matching = data.factions.filter(
    (entry) => entry.isDefault && (entry.displayName.toLowerCase().includes(wanted) || entry.name.toLowerCase().includes(wanted)),
  )
  const favouriteFactions = matching.filter((entry) => favourites.has(entry.id))
  const groups = matching.reduce((grouped, entry) => {
    const title = entry.name.split(' - ')[0] || 'Other'
    grouped.set(title, [...(grouped.get(title) ?? []), entry])
    return grouped
  }, new Map<string, Faction[]>())

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Army reference"
        title="Factions"
        description="Browse faction rules, detachments, datasheets, loadouts and points."
      />
      <PageContent>
        <SearchField
          value={factionQueryText}
          onChange={setFactionQueryText}
          placeholder="Find a faction"
          label="Find a faction"
          clearLabel="Empty the faction filter"
        />
        <FactionShelf
          title="Favourites"
          entries={favouriteFactions}
          versions={data.factions}
          favourites={favourites}
          onFavourite={me ? toggleFavourite : undefined}
        />
        {matching.length ? (
          [...groups.entries()]
            .toSorted(([left], [right]) => left.localeCompare(right))
            .map(([title, entries]) => (
              <FactionShelf
                key={title}
                title={title}
                entries={entries}
                versions={data.factions}
                favourites={favourites}
                onFavourite={me ? toggleFavourite : undefined}
              />
            ))
        ) : (
          <PageState
            className="mt-6"
            headingLevel={2}
            eyebrow="Faction search"
            title="No factions match"
            explanation="Try a broader faction name or clear the search."
          />
        )}
      </PageContent>
    </main>
  )
}

type Faction = {
  edition?: FactionPresentation['edition']
  isDefault?: boolean
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
  versions,
  favourites,
  onFavourite,
}: {
  title: string
  entries: Faction[]
  versions: Faction[]
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
          {entries.map((entry) => {
            const editions = versions.filter((version) => editionFamilyId(version.id) === editionFamilyId(entry.id))
            return (
              <div
                key={entry.id}
                data-onboarding="faction-entry"
                data-faction={entry.displayName}
                className="flex items-center border-l-2"
                style={{ borderLeftColor: factionColour(entry.slug, entry.displayName) }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2">
                  <FactionMark id={entry.slug} name={entry.displayName} edition={entry.edition} icon={entry.icon} />
                  <div className="min-w-0 flex-1">
                    <FactionReferenceLink
                      to="/factions/$catalogueId"
                      params={{ catalogueId: entry.slug }}
                      className="block truncate font-bold uppercase"
                    >
                      {entry.displayName}
                    </FactionReferenceLink>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-dim">
                      <span>{entry.references[0]?.detachments ?? 0} detachments</span>
                      {editions.length > 1 ? (
                        <>
                          <span aria-hidden>·</span>
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              render={<Button variant="ghost" size="sm" aria-label={`Rules versions for ${entry.displayName}`} />}
                              className="h-auto rounded-none p-0 text-xs font-normal text-dim underline-offset-4 hover:text-bone hover:underline"
                            >
                              {editions.length} rules versions
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="min-w-56">
                              {editions.map((version) => (
                                <DropdownMenuItem
                                  key={version.id}
                                  render={<FactionReferenceLink to="/factions/$catalogueId" params={{ catalogueId: version.id }} />}
                                >
                                  {version.edition
                                    ? editionLabel(version.edition)
                                    : version.isDefault === false
                                      ? 'Previous rules'
                                      : 'Current rules'}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
                {onFavourite ? (
                  <Toggle
                    variant="default"
                    size="sm"
                    className="m-1 size-7 bg-transparent p-0"
                    aria-label={`${favourites.has(entry.id) ? 'Remove' : 'Add'} ${entry.displayName} ${favourites.has(entry.id) ? 'from' : 'to'} favourites`}
                    pressed={favourites.has(entry.id)}
                    onPressedChange={() => onFavourite(entry.id)}
                  >
                    <Heart className={`size-4 ${favourites.has(entry.id) ? 'fill-rust text-rust' : 'text-dim'}`} />
                  </Toggle>
                ) : (
                  <Link
                    to="/sign-in"
                    search={{ next: '/factions' }}
                    className="m-1 grid size-7 place-items-center"
                    aria-label={`Sign in to add ${entry.displayName} to favourites`}
                  >
                    <Heart className="size-4 text-dim" />
                  </Link>
                )}
                <ChevronRight className="mr-2 size-4 text-dim" aria-hidden />
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-2 text-sm text-dim">No factions match.</p>
      )}
    </section>
  )
}
