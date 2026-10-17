import { useQuery } from '@tanstack/react-query'
import { Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_COLLECTION_MODELS } from '../../../core/collection'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { ModelCounter } from '../../components/ModelCounter'
import { SearchableSelect } from '../../components/SearchableSelect'
import { collectionWishesQuery, combatUnitsQuery } from '../../queries'
import { useCollectionWantedMutation } from '../../useCollection'

type Datasheet = { id: string; slug: string; name: string; catalogueId: string; faction: string; presentation?: FactionPresentation }

/** Models a player plans to buy, counted apart from those they own. */
export function CollectionWishlist({ datasheets }: { datasheets: ReadonlyMap<string, Datasheet> }) {
  const wishes = useQuery(collectionWishesQuery())
  const units = useQuery(combatUnitsQuery())
  const mutation = useCollectionWantedMutation()
  const wanted = Object.entries(wishes.data ?? {})
    .map(([entryId, count]) => ({ entryId, count, sheet: datasheets.get(entryId) }))
    .toSorted((a, b) => (a.sheet?.name ?? '').localeCompare(b.sheet?.name ?? ''))
  const total = wanted.reduce((sum, wish) => sum + wish.count, 0)
  const set = (entryId: string, count: number) => mutation.mutateAsync({ entryId, wanted: count })
  return (
    <section aria-labelledby="wishlist-heading" className="space-y-3">
      <h2 id="wishlist-heading" className="rubric flex items-baseline justify-between gap-3 border-b border-edge pb-2">
        <span className="flex items-center gap-2">
          <Star className="size-4 text-info" aria-hidden /> Wishlist
        </span>
        <span className="text-xs text-dim normal-case">{total ? `${total} to buy` : 'Models to buy'}</span>
      </h2>
      <SearchableSelect
        ariaLabel="Add a datasheet to your wishlist"
        className="w-full sm:w-80"
        popupClassName="min-w-[min(22rem,var(--available-width))]"
        placeholder="Add to wishlist…"
        searchPlaceholder="Search datasheets…"
        virtualized
        loading={units.isPending}
        value=""
        onValueChange={(value) => void set(value, 1).catch(() => undefined)}
        groups={(units.data ?? []).flatMap((faction) => {
          const items = faction.units.filter((unit) => !wishes.data?.[unit.id]).map((unit) => ({ value: unit.id, label: unit.name }))
          return items.length ? [{ label: faction.name, items }] : []
        })}
      />
      {wanted.length ? (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {wanted.map(({ entryId, count, sheet }) => {
            const name = sheet?.name ?? 'A datasheet from earlier rules'
            return (
              <li key={entryId} data-wish={name} className="flex items-center gap-3 border border-edge bg-panel py-2 pr-2 pl-3">
                {sheet?.presentation ? (
                  <FactionMark
                    id={sheet.presentation.slug}
                    name={sheet.presentation.displayName}
                    edition={sheet.presentation.edition}
                    icon={sheet.presentation.icon}
                    size="sm"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  {sheet ? (
                    <FactionReferenceLink
                      to="/factions/$catalogueId/datasheets/$entryId"
                      params={{ catalogueId: sheet.catalogueId, entryId: sheet.slug }}
                      className="block text-sm font-semibold break-words text-bone uppercase underline-offset-4 hover:text-info hover:underline"
                    >
                      {name}
                    </FactionReferenceLink>
                  ) : (
                    <span className="block truncate text-sm text-dim">{name}</span>
                  )}
                </span>
                <ModelCounter
                  count={count}
                  label={`wanted ${name}`}
                  inputLabel={`${name} models wanted`}
                  max={MAX_COLLECTION_MODELS}
                  onChange={(next) => set(entryId, next)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-faint hover:text-destructive"
                  aria-label={`Remove ${name} from your wishlist`}
                  onClick={() => void set(entryId, 0).catch(() => undefined)}
                >
                  <Trash2 />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
