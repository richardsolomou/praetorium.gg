import { useQuery } from '@tanstack/react-query'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usableDatasheets, MAX_COLLECTION_MODELS } from '../../../core/collection'
import { type FactionPresentation } from '../../components/FactionMark'
import { ModelCounter } from '../../components/ModelCounter'
import { UnitPicker } from '../../components/UnitPicker'
import { collectionCountsAsQuery, collectionQuery, collectionWishesQuery, combatUnitsQuery, wishlistSuggestionsQuery } from '../../queries'
import { useCollectionWantedMutation } from '../../useCollection'
import { countLabel } from '../../text'
import { CollectionCard, CollectionCardGrid } from './CollectionCard'

const SUGGESTIONS_SHOWN = 6

type Datasheet = { id: string; slug: string; name: string; catalogueId: string; faction: string; presentation?: FactionPresentation }

/** Models a player plans to buy, counted apart from those they own. */
export function CollectionWishlist({ datasheets }: { datasheets: ReadonlyMap<string, Datasheet> }) {
  const collection = useQuery(collectionQuery())
  const wishes = useQuery(collectionWishesQuery())
  const countsAs = useQuery(collectionCountsAsQuery())
  const units = useQuery(combatUnitsQuery())
  const suggested = useQuery(wishlistSuggestionsQuery())
  const mutation = useCollectionWantedMutation()
  const wanted = Object.entries(wishes.data ?? {})
    .map(([entryId, count]) => ({ entryId, count, sheet: datasheets.get(entryId) }))
    .toSorted((a, b) => (a.sheet?.name ?? '').localeCompare(b.sheet?.name ?? ''))
  const total = wanted.reduce((sum, wish) => sum + wish.count, 0)
  const set = (entryId: string, count: number) => mutation.mutateAsync({ entryId, wanted: count })
  const owned = usableDatasheets(collection.data ?? [], countsAs.data ?? {})
  const suggestions = (suggested.data ?? [])
    .flatMap((suggestion) => {
      const sheet = datasheets.get(suggestion.entryId)
      return sheet && !owned.has(suggestion.entryId) && !wishes.data?.[suggestion.entryId] ? [{ ...suggestion, sheet }] : []
    })
    .slice(0, SUGGESTIONS_SHOWN)
  return (
    <section aria-labelledby="wishlist-heading" className="@container/army space-y-3">
      <h2
        id="wishlist-heading"
        className="rubric flex flex-col gap-1 border-b border-edge pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
      >
        <span className="flex items-center gap-2">
          <Star className="size-4 text-info" aria-hidden /> Wishlist
        </span>
        <span className="text-xs text-dim normal-case">
          {total ? `${countLabel(total, 'model')} to buy, apart from those you own` : 'Models you plan to buy'}
        </span>
      </h2>
      <UnitPicker
        ariaLabel="Add a datasheet to your wishlist"
        className="w-full sm:w-80"
        popupClassName="min-w-[min(22rem,var(--available-width))]"
        placeholder="Add to wishlist…"
        searchPlaceholder="Search datasheets…"
        loading={units.isPending}
        onUnitChange={(_, entryId) => void set(entryId, 1).catch(() => undefined)}
        index={(units.data ?? []).map((book) => ({ ...book, units: book.units.filter((unit) => !wishes.data?.[unit.id]) }))}
      />
      {wanted.length ? (
        <CollectionCardGrid>
          {wanted.map(({ entryId, count, sheet }) => {
            const name = sheet?.name ?? 'A datasheet from earlier rules'
            return (
              <CollectionCard
                key={entryId}
                data-wish={name}
                name={name}
                sheet={sheet}
                description={sheet?.faction}
                controls={
                  <ModelCounter
                    count={count}
                    label={`wanted ${name}`}
                    inputLabel={`${name} models wanted`}
                    max={MAX_COLLECTION_MODELS}
                    onChange={(next) => set(entryId, next)}
                  />
                }
                action={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-faint hover:text-destructive"
                    aria-label={`Remove ${name} from your wishlist`}
                    onClick={() => void set(entryId, 0).catch(() => undefined)}
                  >
                    <Trash2 />
                  </Button>
                }
              />
            )
          })}
        </CollectionCardGrid>
      ) : null}
      {suggestions.length ? (
        <div className="space-y-2">
          <h3 className="text-xs text-dim">In none of your rosters</h3>
          <CollectionCardGrid>
            {suggestions.map(({ entryId, rosters, of, sheet }) => (
              <CollectionCard
                key={entryId}
                data-wish-suggestion={sheet.name}
                name={sheet.name}
                sheet={sheet}
                description={of ? `In ${rosters} of ${countLabel(of, `recent public ${sheet.faction} roster`)}` : sheet.faction}
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Add ${sheet.name} to your wishlist`}
                    onClick={() => void set(entryId, 1).catch(() => undefined)}
                  >
                    <Plus /> Add
                  </Button>
                }
              />
            ))}
          </CollectionCardGrid>
        </div>
      ) : null}
    </section>
  )
}
