import { collectionDatasheets, type CollectionCounts } from '../../../core/collection'
import { useQuery } from '@tanstack/react-query'
import { Boxes, Plus, Swords, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FactionMark, factionColour, type FactionPresentation } from '../../components/FactionMark'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { PageContent, PageHeader } from '../../components/Page'
import { PageState } from '../../components/PageState'
import { SignInRequired } from '../../components/SignInRequired'
import { UnitPicker } from '../../components/UnitPicker'
import {
  collectionCountsQuery,
  collectionProgressQuery,
  collectionQuery,
  collectionWishesQuery,
  combatUnitsQuery,
  factionIndexQuery,
  fieldedDatasheetsQuery,
  meQuery,
} from '../../queries'
import { useCollectionMutation } from '../../useCollection'
import { CollectionEntryCounts } from './CollectionEntryCounts'
import { CollectionExchange } from './CollectionExchange'
import { CollectionPhoto } from './CollectionPhoto'
import { CollectionWishlist } from './CollectionWishlist'
import { RemoveFromCollection } from './RemoveFromCollection'
import { groupBy } from '../../../core/collections'
import { countLabel } from '../../text'

type Datasheet = { id: string; slug: string; name: string; catalogueId: string; faction: string; presentation?: FactionPresentation }

const SUGGESTIONS_SHOWN = 6

export function CollectionPage() {
  const { data: me } = useQuery(meQuery())
  const collection = useQuery({ ...collectionQuery(), enabled: Boolean(me) })
  const counts = useQuery({ ...collectionCountsQuery(), enabled: Boolean(me) })
  const progress = useQuery({ ...collectionProgressQuery(), enabled: Boolean(me) })
  const wishes = useQuery({ ...collectionWishesQuery(), enabled: Boolean(me) })
  const fielded = useQuery({ ...fieldedDatasheetsQuery(), enabled: Boolean(me) })
  const units = useQuery(combatUnitsQuery())
  const factions = useQuery(factionIndexQuery())
  const { mutate: setOwned } = useCollectionMutation()
  const [removing, setRemoving] = useState<Datasheet | null>(null)
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
  const retired = [...owned].filter((id) => !datasheets.has(id))
  const suggestions = (fielded.data ?? []).flatMap(({ entryId, battles }) => {
    const sheet = datasheets.get(entryId)
    return sheet && !owned.has(entryId) ? [{ ...sheet, battles }] : []
  })
  const models = [...owned].reduce((total, id) => total + countOf(id), 0)
  const exchanged = new Map<string, CollectionCounts>()
  for (const id of new Set([...owned, ...Object.keys(wishes.data ?? {})]))
    exchanged.set(id, {
      models: owned.has(id) ? countOf(id) : 0,
      built: progress.data?.[id]?.built ?? 0,
      painted: progress.data?.[id]?.painted ?? 0,
      wanted: wishes.data?.[id] ?? 0,
    })
  const pending = collection.isPending || units.isPending
  const add = (entryId: string) => setOwned({ entryId, owned: true })
  // Suggestions lead an empty shelf and follow a stocked one, so the collection itself comes first.
  const fieldedShelf = suggestions.length ? (
    <section aria-labelledby="fielded-heading">
      <h2
        id="fielded-heading"
        className="rubric flex flex-col gap-1 border-b border-edge pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
      >
        <span className="flex items-center gap-2">
          <Swords className="size-4 text-info" aria-hidden /> From your battles
        </span>
        <span className="text-xs text-dim normal-case">Fielded, not yet in your collection</span>
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(allSuggestions ? suggestions : suggestions.slice(0, SUGGESTIONS_SHOWN)).map((sheet) => (
          <li
            key={sheet.id}
            data-suggestion={sheet.name}
            className="flex items-center gap-3 border border-dashed border-edge-strong bg-sunken/60 py-2 pr-2 pl-3"
          >
            {sheet.presentation ? <Mark faction={sheet.presentation} /> : null}
            <span className="min-w-0 flex-1">
              <FactionReferenceLink
                to="/factions/$catalogueId/datasheets/$entryId"
                params={{ catalogueId: sheet.catalogueId, entryId: sheet.slug }}
                className="inline-block max-w-full truncate align-top text-sm font-semibold text-bone uppercase underline-offset-4 hover:text-info hover:underline"
              >
                {sheet.name}
              </FactionReferenceLink>
              <span className="block text-xs text-dim">{countLabel(sheet.battles, 'battle')}</span>
            </span>
            <Button size="sm" variant="outline" aria-label={`Add ${sheet.name} to your collection`} onClick={() => add(sheet.id)}>
              <Plus /> Add
            </Button>
          </li>
        ))}
      </ul>
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
        eyebrow="Your account"
        title="Collection"
        description="The models on your shelf, counted by datasheet. Add them here or from any datasheet’s page."
      />
      <PageContent className="space-y-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <UnitPicker
            ariaLabel="Add a datasheet to your collection"
            className="w-full sm:w-80"
            popupClassName="min-w-[min(22rem,var(--available-width))]"
            placeholder="Add a datasheet…"
            searchPlaceholder="Search datasheets…"
            loading={units.isPending}
            value=""
            onValueChange={(value) => add((JSON.parse(value) as [string, string])[1])}
            index={(units.data ?? []).map((book) => ({ ...book, units: book.units.filter((unit) => !owned.has(unit.id)) }))}
          />
          <p className="flex items-baseline gap-4 sm:ml-auto">
            <Tally label="models" value={pending ? null : models} />
            <Tally label={owned.size === 1 ? 'datasheet' : 'datasheets'} value={pending ? null : owned.size} />
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CollectionExchange sheets={[...datasheets.values()]} current={exchanged} />
        </div>

        {owned.size ? null : fieldedShelf}

        {pending ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        ) : !owned.size ? (
          <PageState
            headingLevel={2}
            icon={Boxes}
            eyebrow="Your collection"
            title="Your shelf is empty"
            explanation={
              suggestions.length
                ? 'Add the datasheets you have fielded, or search for any datasheet, then set how many models you have.'
                : 'Search for a datasheet above, or add one from its page, then set how many models you have.'
            }
          />
        ) : (
          <div className="gap-4 space-y-4 lg:columns-2">
            {armies.map(({ sheets, first }) => {
              const armyModels = sheets.reduce((total, sheet) => total + countOf(sheet.id), 0)
              return (
                <section
                  key={first.catalogueId}
                  aria-label={first.faction}
                  className="break-inside-avoid border border-t-[3px] border-edge bg-panel"
                  style={{ borderTopColor: factionColour(first.presentation?.slug ?? first.catalogueId, first.faction) }}
                >
                  <header className="flex items-center gap-3 border-b border-edge px-3 py-2.5">
                    {first.presentation ? <Mark faction={first.presentation} size="md" /> : null}
                    <h2 className="rubric min-w-0 flex-1 truncate text-bone">{first.faction}</h2>
                    <span className="text-xs text-dim">
                      <span className="figure mr-1 text-lg text-bone">{armyModels}</span>
                      {armyModels === 1 ? 'model' : 'models'}
                    </span>
                  </header>
                  <ul className="divide-y divide-edge">
                    {sheets.map((sheet) => (
                      <li
                        key={sheet.id}
                        data-unit={sheet.name}
                        className="grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[auto_1fr] gap-x-3 p-2"
                      >
                        <span className="row-span-2">
                          <CollectionPhoto entryId={sheet.id} name={sheet.name} />
                        </span>
                        <div className="flex items-start justify-between gap-2">
                          <FactionReferenceLink
                            to="/factions/$catalogueId/datasheets/$entryId"
                            params={{ catalogueId: sheet.catalogueId, entryId: sheet.slug }}
                            className="text-sm font-semibold break-words text-bone uppercase underline-offset-4 hover:text-info hover:underline"
                          >
                            {sheet.name}
                          </FactionReferenceLink>
                          <RemoveButton name={sheet.name} onRemove={() => setRemoving(sheet)} />
                        </div>
                        <div className="col-start-2">
                          <CollectionEntryCounts entryId={sheet.id} name={sheet.name} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
            {retired.length ? (
              <section aria-label="Retired datasheets" className="break-inside-avoid border border-edge bg-panel">
                <header className="border-b border-edge px-3 py-2.5">
                  <h2 className="rubric">No longer in the rules</h2>
                </header>
                <ul className="divide-y divide-edge">
                  {retired.map((entryId) => (
                    <li key={entryId} className="flex min-h-12 items-center gap-2 py-1.5 pr-1.5 pl-3 text-sm text-dim">
                      <span className="min-w-0 flex-1">A datasheet from earlier rules</span>
                      <RemoveButton
                        name="this datasheet"
                        onRemove={() => setRemoving({ id: entryId, slug: entryId, name: 'this datasheet', catalogueId: '', faction: '' })}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
        <CollectionWishlist datasheets={datasheets} />
        {owned.size ? fieldedShelf : null}
      </PageContent>
      <RemoveFromCollection datasheet={removing} onClose={() => setRemoving(null)} />
    </main>
  )
}

function Mark({ faction, size = 'sm' }: { faction: FactionPresentation; size?: 'sm' | 'md' }) {
  return <FactionMark id={faction.slug} name={faction.displayName} edition={faction.edition} icon={faction.icon} size={size} />
}

function Tally({ label, value }: { label: string; value: number | null }) {
  return (
    <span data-tally={label} className="text-xs text-dim">
      {value === null ? (
        <Skeleton className="mr-1 inline-block h-5 w-6 align-middle" aria-label={`Loading ${label}`} />
      ) : (
        <span className="figure mr-1 text-2xl text-bone">{value}</span>
      )}
      {label}
    </span>
  )
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="text-faint hover:text-destructive"
      aria-label={`Remove ${name} from your collection`}
      onClick={onRemove}
    >
      <Trash2 />
    </Button>
  )
}
