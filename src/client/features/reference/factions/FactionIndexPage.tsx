import { GuideHelp } from '../../onboarding/GuideHelp'
import { FactionReferenceLink } from '../../../components/FactionReferenceLink'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { currentCatalogueFamilyId } from '../../../../core/retiredCatalogueIds'
import { factionIndexQuery, meQuery } from '../../../queries'
import { useFavouriteFactions } from '../../../favouriteFactions'
import { FactionMark, type FactionPresentation } from '../../../components/FactionMark'
import { SearchField } from '../../../components/SearchField'
import { FullPageState, PageState } from '../../../components/PageState'
import { PageContent, PageHeader } from '../../../components/Page'
import { groupBy } from '../../../../core/collections'
import { countLabel, matchesSearch } from '../../../text'
import { SectionHeading } from '../../../components/SectionHeading'

export function FactionIndexPage() {
  const { data } = useQuery(factionIndexQuery())
  const { data: me } = useQuery(meQuery())
  const [factionQueryText, setFactionQueryText] = useState('')
  const { favourites, toggleFavourite } = useFavouriteFactions()
  if (!data)
    return (
      <FullPageState
        loading
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
        title="Factions"
        description="Browse faction rules, detachments, datasheets, loadouts and points."
        help={<GuideHelp task="reference">Search help</GuideHelp>}
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
            featured
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

/**
 * One grand alliance as ruled rows, or the favourites as larger tiles above them, since those are what the player opens most.
 */
function FactionShelf({
  title,
  entries,
  versions,
  favourites,
  onFavourite,
  featured = false,
}: {
  title: string
  entries: Faction[]
  versions: Faction[]
  favourites: Set<string>
  onFavourite?: (id: string) => void
  featured?: boolean
}) {
  return (
    <section data-shelf={title} className="mt-8">
      <SectionHeading title={title} count={entries.length} />
      <div
        className={
          featured ? 'grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4' : 'grid sm:grid-cols-2 sm:gap-x-6 xl:grid-cols-3'
        }
      >
        {entries.map((entry) => {
          const editions = versions.filter((version) => currentCatalogueFamilyId(version.id) === currentCatalogueFamilyId(entry.id)).length
          return (
            <div
              key={entry.id}
              data-faction={entry.displayName}
              className={
                featured
                  ? 'flex min-h-17 items-center part pr-1.5 transition-colors hover:border-runner-hi hover:bg-raised'
                  : 'flex min-h-14 items-center border-t border-edge pr-1 transition-colors hover:bg-raised'
              }
            >
              <FactionReferenceLink
                to="/factions/$catalogueId"
                params={{ catalogueId: entry.slug }}
                className={`flex min-w-0 flex-1 items-center gap-3 self-stretch pr-1 ${featured ? 'py-2.5 pl-3' : 'py-2 pl-2'}`}
              >
                <FactionMark faction={entry} className={featured ? 'size-11' : 'size-8'} />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block font-bold text-balance break-words text-bone ${featured ? 'font-display text-lg leading-tight' : 'text-[0.9375rem] leading-snug'}`}
                  >
                    {entry.displayName}
                  </span>
                  <span className="block truncate text-2xs text-faint">
                    {[
                      countLabel(entry.references[0]?.detachments ?? 0, 'detachment'),
                      ...(editions > 1 ? [`${editions} rules versions`] : []),
                    ].join(' · ')}
                  </span>
                </span>
              </FactionReferenceLink>
              {onFavourite ? (
                <Toggle
                  variant="default"
                  size="sm"
                  className="size-9 bg-transparent p-0 aria-pressed:bg-transparent hover:bg-transparent"
                  aria-label={`${favourites.has(entry.id) ? 'Remove' : 'Add'} ${entry.displayName} ${favourites.has(entry.id) ? 'from' : 'to'} favourites`}
                  pressed={favourites.has(entry.id)}
                  onPressedChange={() => onFavourite(entry.id)}
                >
                  <Heart className={`size-4 ${favourites.has(entry.id) ? 'fill-rust text-rust' : 'text-faint hover:text-dim'}`} />
                </Toggle>
              ) : (
                <Link
                  to="/sign-in"
                  search={{ next: '/factions' }}
                  className="grid size-9 place-items-center"
                  aria-label={`Sign in to add ${entry.displayName} to favourites`}
                >
                  <Heart className="size-4 text-faint hover:text-dim" />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
