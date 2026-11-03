import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usableDatasheets, MAX_COLLECTION_MODELS } from '../../../core/collection'
import { type FactionPresentation } from '../../components/FactionMark'
import { ModelCounter } from '../../components/ModelCounter'
import { UnitPicker } from '../../components/UnitPicker'
import {
  collectionCountsAsQuery,
  collectionCountsQuery,
  collectionQuery,
  collectionWishesQuery,
  combatUnitsQuery,
  factionIndexQuery,
  wishlistSuggestionsQuery,
} from '../../queries'
import { useCollectionWantedMutation } from '../../useCollection'
import { countLabel } from '../../text'
import { SectionHeading } from '../../components/SectionHeading'
import { groupBy } from '../../../core/collections'
import { ArmyHeader } from './ArmyHeader'
import { CollectionCard, CollectionCardGrid } from './CollectionCard'
import { WishToCollection } from './WishToCollection'

const SUGGESTIONS_SHOWN = 6

export type Datasheet = { id: string; slug: string; name: string; catalogueId: string; faction: string; presentation?: FactionPresentation }

/** Models a player plans to buy, counted apart from those they own. */
export function CollectionWishlist({ datasheets }: { datasheets: ReadonlyMap<string, Datasheet> }) {
  const collection = useQuery(collectionQuery())
  const counts = useQuery(collectionCountsQuery())
  const wishes = useQuery(collectionWishesQuery())
  const countsAs = useQuery(collectionCountsAsQuery())
  const units = useQuery(combatUnitsQuery())
  const suggested = useQuery(wishlistSuggestionsQuery())
  const factions = useQuery(factionIndexQuery())
  const mutation = useCollectionWantedMutation()
  const wanted = Object.entries(wishes.data ?? {})
    .map(([entryId, count]) => ({ entryId, count, sheet: datasheets.get(entryId) }))
    .toSorted((a, b) => (a.sheet?.name ?? '').localeCompare(b.sheet?.name ?? ''))
  const total = wanted.reduce((sum, wish) => sum + wish.count, 0)
  // Wishes from earlier rules have no army, so they gather last under their own heading.
  const armies = [...groupBy(wanted, (wish) => wish.sheet?.catalogueId ?? '').values()].toSorted(
    (a, b) => Number(!a[0]!.sheet) - Number(!b[0]!.sheet) || a[0]!.sheet!.faction.localeCompare(b[0]!.sheet!.faction),
  )
  const ownedSheets = new Set(collection.data ?? [])
  const shelfKnown = collection.isSuccess && counts.isSuccess
  const set = (entryId: string, count: number) => mutation.mutateAsync({ entryId, wanted: count })
  const owned = usableDatasheets(collection.data ?? [], countsAs.data ?? {})
  const suggestions = (suggested.data ?? [])
    .flatMap((suggestion) => {
      const sheet = datasheets.get(suggestion.entryId)
      const army = factions.data?.factions.find((entry) => entry.id === suggestion.catalogueId)
      if (!sheet || !army || owned.has(suggestion.entryId) || wishes.data?.[suggestion.entryId]) return []
      // A datasheet many armies share is shown as part of the army it was suggested for.
      return [{ ...suggestion, sheet: { ...sheet, catalogueId: army.id, faction: army.displayName, presentation: army } }]
    })
    .slice(0, SUGGESTIONS_SHOWN)
  return (
    <section data-onboarding="collection-wishlist" aria-labelledby="wishlist-heading" className="@container/army space-y-4">
      <div>
        <SectionHeading id="wishlist-heading" title="Wishlist" count={total} className="mb-0" />
        <p className="text-xs text-dim">Models you plan to buy, apart from those you own.</p>
      </div>
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
      {armies.map((army) => {
        const first = army[0]!.sheet
        const faction = first?.faction ?? 'No longer in the rules'
        return (
          <section key={first?.catalogueId ?? 'retired'} aria-label={`${faction} wishlist`} className="space-y-3">
            <ArmyHeader
              name={faction}
              faction={first?.presentation}
              datasheets={army.length}
              totals={{ wanted: army.reduce((sum, wish) => sum + wish.count, 0) }}
            />
            <CollectionCardGrid>
              {army.map(({ entryId, count, sheet }) => {
                const name = sheet?.name ?? 'A datasheet from earlier rules'
                const onShelf = ownedSheets.has(entryId) ? (counts.data?.[entryId] ?? 1) : 0
                return (
                  <CollectionCard
                    key={entryId}
                    data-wish={name}
                    name={name}
                    sheet={sheet}
                    className="border-dashed border-runner-hi"
                    action={
                      <span className="flex items-center">
                        <WishToCollection entryId={entryId} name={name} wanted={count} onShelf={shelfKnown ? onShelf : null} />
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-faint hover:text-destructive"
                          aria-label={`Remove ${name} from your wishlist`}
                          onClick={() => void set(entryId, 0).catch(() => undefined)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    }
                  >
                    <span className="@container block">
                      <span className="grid grid-cols-1 gap-2 @[15rem]:grid-cols-2">
                        <ModelCounter
                          count={count}
                          label={`wanted ${name}`}
                          inputLabel={`${name} models wanted`}
                          max={MAX_COLLECTION_MODELS}
                          compact
                          caption="Wanted"
                          onChange={(next) => set(entryId, next)}
                        />
                        <span className="flex min-w-0 items-center justify-between gap-2 @[15rem]:flex-col @[15rem]:gap-1">
                          <span className="h-4 text-xs text-dim">On shelf</span>
                          <span data-on-shelf className={`readout h-6 text-sm leading-6 ${onShelf ? 'text-bone' : 'text-faint'}`}>
                            {shelfKnown ? onShelf : '—'}
                          </span>
                        </span>
                      </span>
                    </span>
                  </CollectionCard>
                )
              })}
            </CollectionCardGrid>
          </section>
        )
      })}
      {suggestions.length ? (
        <section aria-labelledby="wish-suggestions-heading" className="space-y-3 pt-2">
          <div>
            <h3 id="wish-suggestions-heading" className="rubric text-bone">
              Popular in your armies
            </h3>
            <p className="mt-1 text-xs text-dim">
              What other players field in the armies you build most, and none of your rosters use yet.
            </p>
          </div>
          <CollectionCardGrid>
            {suggestions.map(({ entryId, rosters, of, sheet }) => (
              <CollectionCard
                key={entryId}
                data-wish-suggestion={sheet.name}
                name={sheet.name}
                sheet={sheet}
                description={`In ${rosters} of ${countLabel(of, `recent public ${sheet.faction} roster`)}`}
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
        </section>
      ) : null}
    </section>
  )
}
