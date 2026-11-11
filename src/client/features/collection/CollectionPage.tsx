import { boundedProgress, collectionDatasheets, usableDatasheets, type CollectionEntry } from '../../../core/collection'
import { useQuery } from '@tanstack/react-query'
import { Boxes, EllipsisVertical, Plus, Shuffle, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { SectionHeading } from '../../components/SectionHeading'
import { SignInRequired } from '../../components/SignInRequired'
import { UnitPicker } from '../../components/UnitPicker'
import {
  collectionCountsQuery,
  collectionCountsAsQuery,
  collectionProgressQuery,
  collectionQuery,
  collectionWishesQuery,
  combatUnitsQuery,
  factionIndexQuery,
  fieldedDatasheetsQuery,
  meQuery,
} from '../../queries'
import { useCollectionMutation } from '../../useCollection'
import { ArmyHeader } from './ArmyHeader'
import { CollectionCard, CollectionCardGrid } from './CollectionCard'
import { CollectionEntryCounts } from './CollectionEntryCounts'
import { CollectionExchange } from './CollectionExchange'
import { CollectionCountsAs, CountsAsDialog } from './CollectionCountsAs'
import { CollectionPhoto } from './CollectionPhoto'
import { CollectionWishlist, type Datasheet } from './CollectionWishlist'
import { RemoveFromCollection } from './RemoveFromCollection'
import { ShelfLine } from './ShelfLine'
import { groupBy } from '../../../core/collections'
import { countLabel } from '../../text'
import { GuideHelp } from '../onboarding/GuideHelp'
import { advanceOnboarding } from '../onboarding/onboarding'
import { DropdownMenuItem } from '../../components/Menu'

const SUGGESTIONS_SHOWN = 6

export function CollectionPage() {
  const { data: me } = useQuery(meQuery())
  const collection = useQuery({ ...collectionQuery(), enabled: Boolean(me) })
  const counts = useQuery({ ...collectionCountsQuery(), enabled: Boolean(me) })
  const progress = useQuery({ ...collectionProgressQuery(), enabled: Boolean(me) })
  const wishes = useQuery({ ...collectionWishesQuery(), enabled: Boolean(me) })
  const countsAs = useQuery({ ...collectionCountsAsQuery(), enabled: Boolean(me) })
  const fielded = useQuery({ ...fieldedDatasheetsQuery(), enabled: Boolean(me) })
  const units = useQuery(combatUnitsQuery())
  const factions = useQuery(factionIndexQuery())
  const { mutate: setOwned } = useCollectionMutation()
  const [removing, setRemoving] = useState<Datasheet | null>(null)
  const [linking, setLinking] = useState<Datasheet | null>(null)
  const [allSuggestions, setAllSuggestions] = useState(false)
  if (!me) return <SignInRequired title="Your collection" explanation="Sign in to keep track of the models you own." next="/collection" />

  const datasheets = new Map<string, Datasheet>(
    [...collectionDatasheets(units.data ?? [])].map(([id, sheet]) => [
      id,
      { ...sheet, presentation: factions.data?.factions.find((entry) => entry.id === sheet.catalogueId) },
    ]),
  )
  const owned = new Set(collection.data ?? [])
  const countOf = (entryId: string) => counts.data?.[entryId] ?? 1
  const byFaction = groupBy(
    [...owned].flatMap((id) => datasheets.get(id) ?? []),
    (sheet) => sheet.catalogueId,
  )
  const armies = [...byFaction.values()]
    .map((sheets) => ({ sheets: sheets.toSorted((a, b) => a.name.localeCompare(b.name)), first: sheets[0]! }))
    .toSorted((a, b) => a.first.faction.localeCompare(b.first.faction))
  const armySheets = groupBy(
    [...datasheets.values()].toSorted((a, b) => a.name.localeCompare(b.name)),
    (sheet) => sheet.catalogueId,
  )
  const retired = [...owned].filter((id) => !datasheets.has(id))
  const usable = usableDatasheets(owned, countsAs.data ?? {})
  const suggestions = (fielded.data ?? []).flatMap(({ entryId, battles }) => {
    const sheet = datasheets.get(entryId)
    return sheet && !usable.has(entryId) ? [{ ...sheet, battles }] : []
  })
  const shelved = (entryIds: readonly string[]) =>
    entryIds.reduce(
      (total, entryId) => {
        const ownedModels = countOf(entryId)
        const { built, painted } = boundedProgress(ownedModels, progress.data?.[entryId] ?? { built: 0, painted: 0 })
        return { owned: total.owned + ownedModels, built: total.built + built, painted: total.painted + painted }
      },
      { owned: 0, built: 0, painted: 0 },
    )
  const shelf = shelved([...owned])
  const exchanged = new Map<string, CollectionEntry>()
  for (const id of new Set([...owned, ...Object.keys(wishes.data ?? {})]))
    exchanged.set(id, {
      models: owned.has(id) ? countOf(id) : 0,
      built: progress.data?.[id]?.built ?? 0,
      painted: progress.data?.[id]?.painted ?? 0,
      wanted: wishes.data?.[id] ?? 0,
      countsAs: countsAs.data?.[id],
    })
  const pending = collection.isPending || units.isPending
  const add = (entryId: string) => {
    setOwned({ entryId, owned: true })
    advanceOnboarding('collection', 'collection-add', 'collection-counts')
  }
  // Suggestions lead an empty shelf and follow a stocked one, so the collection itself comes first.
  const fieldedShelf = suggestions.length ? (
    <section aria-labelledby="fielded-heading" className="@container/army space-y-3">
      <div>
        <SectionHeading id="fielded-heading" title="From your battles" count={suggestions.length} className="mb-0" />
        <p className="text-xs text-dim">Fielded, not yet in your collection.</p>
      </div>
      <CollectionCardGrid>
        {(allSuggestions ? suggestions : suggestions.slice(0, SUGGESTIONS_SHOWN)).map((sheet) => (
          <CollectionCard
            key={sheet.id}
            data-suggestion={sheet.name}
            name={sheet.name}
            sheet={sheet}
            description={countLabel(sheet.battles, 'battle')}
            action={
              <Button size="sm" variant="outline" aria-label={`Add ${sheet.name} to your collection`} onClick={() => add(sheet.id)}>
                <Plus /> Add
              </Button>
            }
          />
        ))}
      </CollectionCardGrid>
      {suggestions.length > SUGGESTIONS_SHOWN ? (
        <Button variant="link" size="sm" className="mt-1 px-0 text-info" onClick={() => setAllSuggestions((shown) => !shown)}>
          {allSuggestions ? 'Show fewer' : `Show all ${suggestions.length}`}
        </Button>
      ) : null}
    </section>
  ) : null

  return (
    <main className="w-full">
      <PageHeader
        title="Collection"
        description="The models on your shelf, from sprue to painted, counted by datasheet. Add them here or from any datasheet’s page."
        actions={<CollectionExchange sheets={[...datasheets.values()]} current={exchanged} />}
        help={<GuideHelp task="collection">Collection guide</GuideHelp>}
      />
      <PageContent className="space-y-8">
        <div className="space-y-4">
          {owned.size ? (
            <section aria-label="Your shelf" className="part space-y-3 p-3 sm:p-4">
              <dl className="grid grid-cols-3 gap-3">
                <Stage
                  label="Owned"
                  value={pending ? null : shelf.owned}
                  detail={pending ? null : countLabel(owned.size, 'datasheet')}
                  tally="models"
                />
                <Stage label="Built" value={pending || progress.isPending ? null : shelf.built} detail={share(shelf.built, shelf.owned)} />
                <Stage
                  label="Painted"
                  value={pending || progress.isPending ? null : shelf.painted}
                  detail={share(shelf.painted, shelf.owned)}
                />
              </dl>
              {pending || progress.isPending ? <Skeleton className="h-1.5" /> : <ShelfLine {...shelf} />}
            </section>
          ) : null}
          <div data-onboarding="collection-add" className="w-full sm:w-80">
            <UnitPicker
              ariaLabel="Add a datasheet to your collection"
              className="w-full"
              popupClassName="min-w-[min(22rem,var(--available-width))]"
              placeholder="Add a datasheet…"
              searchPlaceholder="Search datasheets…"
              loading={units.isPending}
              onUnitChange={(_, entryId) => add(entryId)}
              index={(units.data ?? []).map((book) => ({ ...book, units: book.units.filter((unit) => !owned.has(unit.id)) }))}
            />
          </div>
        </div>

        {owned.size ? null : fieldedShelf}

        {pending ? (
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : !owned.size ? (
          <PageState
            headingLevel={2}
            icon={Boxes}
            title="Your shelf is empty"
            explanation={
              suggestions.length
                ? 'Add the datasheets you have fielded, or search for any datasheet, then set how many models you have.'
                : 'Search for a datasheet above, or add one from its page, then set how many models you have.'
            }
          />
        ) : (
          <div className="space-y-8">
            {armies.map(({ sheets, first }) => (
              <section key={first.catalogueId} aria-label={first.faction} className="@container/army space-y-3">
                <ArmyHeader
                  name={first.faction}
                  faction={first.presentation}
                  datasheets={sheets.length}
                  totals={shelved(sheets.map((sheet) => sheet.id))}
                  pending={counts.isPending || progress.isPending}
                />
                <CollectionCardGrid>
                  {sheets.map((sheet) => (
                    <CollectionCard
                      key={sheet.id}
                      data-unit={sheet.name}
                      name={sheet.name}
                      sheet={sheet}
                      photo={<CollectionPhoto entryId={sheet.id} name={sheet.name} army={armySheets.get(sheet.catalogueId)} />}
                      action={<EntryMenu name={sheet.name} onCountsAs={() => setLinking(sheet)} onRemove={() => setRemoving(sheet)} />}
                    >
                      {counts.isPending || progress.isPending ? null : (
                        <ShelfLine owned={countOf(sheet.id)} {...(progress.data?.[sheet.id] ?? { built: 0, painted: 0 })} />
                      )}
                      <CollectionEntryCounts entryId={sheet.id} name={sheet.name} />
                      <CollectionCountsAs entryId={sheet.id} candidates={armySheets.get(sheet.catalogueId) ?? []} />
                    </CollectionCard>
                  ))}
                </CollectionCardGrid>
              </section>
            ))}
            {retired.length ? (
              <section aria-label="Retired datasheets" className="part">
                <header className="border-b border-edge px-3 py-2.5">
                  <h2 className="rubric">No longer in the rules</h2>
                </header>
                <ul className="divide-y divide-edge">
                  {retired.map((entryId) => (
                    <li key={entryId} className="flex min-h-12 items-center gap-2 py-1.5 pr-1.5 pl-3 text-sm text-dim">
                      <span className="min-w-0 flex-1">A datasheet from earlier rules</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-faint hover:text-destructive"
                        aria-label="Remove this datasheet from your collection"
                        onClick={() => setRemoving({ id: entryId, slug: entryId, name: 'this datasheet', catalogueId: '', faction: '' })}
                      >
                        <Trash2 />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
        {owned.size ? fieldedShelf : null}
        <CollectionWishlist datasheets={datasheets} />
      </PageContent>
      <RemoveFromCollection datasheet={removing} onClose={() => setRemoving(null)} />
      <CountsAsDialog
        datasheet={linking}
        candidates={linking ? (armySheets.get(linking.catalogueId) ?? []).filter((other) => other.id !== linking.id) : []}
        onClose={() => setLinking(null)}
      />
    </main>
  )
}

const share = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : null)

/** One stage of the shelf, from sprue to painted, with its figure rising into place as it changes. */
function Stage({ label, value, detail, tally }: { label: string; value: number | null; detail: string | null; tally?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-semibold tracking-label text-dim uppercase">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
        {value === null ? (
          <Skeleton className="h-8 w-10" aria-label={`Loading ${label.toLowerCase()}`} />
        ) : (
          <span key={value} data-tally={tally} className="figure animate-figure text-3xl leading-none text-bone motion-reduce:animate-none">
            {value}
          </span>
        )}
        {detail ? <span className="text-xs text-dim">{detail}</span> : null}
      </dd>
    </div>
  )
}

function EntryMenu({ name, onCountsAs, onRemove }: { name: string; onCountsAs: () => void; onRemove: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            data-onboarding="collection-menu"
            variant="ghost"
            size="icon-sm"
            className="text-faint"
            aria-label={`Actions for ${name}`}
          />
        }
      >
        <EllipsisVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onCountsAs}>
          <Shuffle /> Can also be…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2 /> Remove
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
