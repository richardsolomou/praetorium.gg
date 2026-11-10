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
import { FactionMark, type FactionPresentation } from '../../../components/FactionMark'
import { RUNNER_COLUMNS } from '../runnerColumns'
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
    <section data-shelf={title} className="mt-8">
      <SectionHeading title={title} count={entries.length} />
      <div className={`${RUNNER_COLUMNS} [--gate-y:1.875rem] md:columns-2 xl:columns-3`}>
        {entries.map((entry) => {
          const editions = versions.filter((version) => currentCatalogueFamilyId(version.id) === currentCatalogueFamilyId(entry.id)).length
          return (
            <div
              key={entry.id}
              data-faction={entry.displayName}
              className="flex min-h-15 items-center part pr-2 transition-colors hover:border-runner hover:bg-raised"
            >
              <FactionReferenceLink
                to="/factions/$catalogueId"
                params={{ catalogueId: entry.slug }}
                className="flex min-w-0 flex-1 items-center gap-3 self-stretch py-2.5 pr-1 pl-3"
              >
                <FactionMark faction={entry} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-bold">{entry.displayName}</span>
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
                  className="size-9 bg-transparent p-0 aria-pressed:bg-transparent hover:bg-transparent"
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
                  className="grid size-9 place-items-center"
                  aria-label={`Sign in to add ${entry.displayName} to favourites`}
                >
                  <Heart className="size-4 text-dim" />
                </Link>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
