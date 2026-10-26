import { GuideHelp } from '../../onboarding/GuideHelp'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight, Heart } from 'lucide-react'
import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { currentCatalogueFamilyId } from '../../../../core/retiredCatalogueIds'
import { factionIndexQuery, meQuery } from '../../../queries'
import { useFavouriteFactions } from '../../../favouriteFactions'
import { FactionMark, factionColour, type FactionPresentation } from '../../../components/FactionMark'
import { SearchField } from '../../../components/SearchField'
import { FullPageState, PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'
import { groupBy } from '../../../../core/collections'
import { countLabel, matchesSearch } from '../../../text'

export function FactionIndexPage() {
  const { data } = useQuery(factionIndexQuery())
  const { data: me } = useQuery(meQuery())
  const [factionQueryText, setFactionQueryText] = useState('')
  const { favourites, toggleFavourite } = useFavouriteFactions()
  if (!data)
    return (
      <FullPageState
        loading
        eyebrow="Factions"
        title="Getting army data ready"
        explanation="Faction rules, datasheets and points will be available shortly."
      />
    )

  const matching = data.factions.filter((entry) => entry.isDefault && matchesSearch(`${entry.displayName} ${entry.name}`, factionQueryText))
  const favouriteFactions = matching.filter((entry) => favourites.has(entry.id))
  const groups = groupBy(matching, (entry) => entry.name.split(' - ')[0] || 'Other')

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Army reference"
        title="Factions"
        description="Browse faction rules, detachments, datasheets, loadouts and points."
        actions={<GuideHelp task="reference">Search help</GuideHelp>}
      />
      <PageContent>
        <SearchField
          value={factionQueryText}
          onChange={setFactionQueryText}
          placeholder="Find a faction"
          label="Find a faction"
          clearLabel="Empty the faction filter"
        />
        {favouriteFactions.length ? (
          <FactionShelf
            title="Favourites"
            entries={favouriteFactions}
            versions={data.factions}
            favourites={favourites}
            onFavourite={me ? toggleFavourite : undefined}
          />
        ) : null}
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
  rulesName?: string
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
      <h2 className="rubric flex items-baseline justify-between border-b border-edge pb-2">
        <span>{title}</span>
        <span className="readout">{entries.length}</span>
      </h2>
      {entries.length ? (
        <div className="mt-2 grid grid-cols-1 gap-px border border-edge bg-panel md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => {
            const editions = versions.filter(
              (version) => currentCatalogueFamilyId(version.id) === currentCatalogueFamilyId(entry.id),
            ).length
            return (
              <div
                key={entry.id}
                data-faction={entry.displayName}
                className="flex items-center border-l-2 bg-panel pr-1 ring-1 ring-edge hover:bg-raised"
                style={{ borderLeftColor: factionColour(entry.slug, entry.displayName) }}
              >
                <FactionReferenceLink
                  to="/factions/$catalogueId"
                  params={{ catalogueId: entry.slug }}
                  className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2 pr-1 pl-3"
                >
                  <FactionMark faction={entry} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold uppercase">{entry.displayName}</span>
                    <span className="block text-xs text-dim">
                      {[
                        countLabel(entry.references[0]?.detachments ?? 0, 'detachment'),
                        ...(editions > 1 ? [`${editions} rules versions`] : []),
                      ].join(' · ')}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-dim" aria-hidden />
                </FactionReferenceLink>
                {onFavourite ? (
                  <Toggle
                    variant="default"
                    size="sm"
                    className="size-7 bg-transparent p-0"
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
                    className="grid size-7 place-items-center"
                    aria-label={`Sign in to add ${entry.displayName} to favourites`}
                  >
                    <Heart className="size-4 text-dim" />
                  </Link>
                )}
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
