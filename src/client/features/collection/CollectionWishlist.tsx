import { useQuery } from '@tanstack/react-query'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MAX_COLLECTION_MODELS } from '../../../core/collection'
import { FactionMark, type FactionPresentation } from '../../components/FactionMark'
import { FactionReferenceLink } from '../../components/FactionReferenceLink'
import { ModelCounter } from '../../components/ModelCounter'
import { UnitPicker } from '../../components/UnitPicker'
import { collectionWishesQuery, combatUnitsQuery, wishlistSuggestionsQuery } from '../../queries'
import { useCollectionWantedMutation } from '../../useCollection'
import { countLabel } from '../../text'

const SUGGESTIONS_SHOWN = 6

type Datasheet = { id: string; slug: string; name: string; catalogueId: string; faction: string; presentation?: FactionPresentation }

/** Models a player plans to buy, counted apart from those they own. */
export function CollectionWishlist({ datasheets }: { datasheets: ReadonlyMap<string, Datasheet> }) {
  const wishes = useQuery(collectionWishesQuery())
  const units = useQuery(combatUnitsQuery())
  const suggested = useQuery(wishlistSuggestionsQuery())
  const mutation = useCollectionWantedMutation()
  const wanted = Object.entries(wishes.data ?? {})
    .map(([entryId, count]) => ({ entryId, count, sheet: datasheets.get(entryId) }))
    .toSorted((a, b) => (a.sheet?.name ?? '').localeCompare(b.sheet?.name ?? ''))
  const total = wanted.reduce((sum, wish) => sum + wish.count, 0)
  const set = (entryId: string, count: number) => mutation.mutateAsync({ entryId, wanted: count })
  const suggestions = (suggested.data ?? [])
    .flatMap((suggestion) => {
      const sheet = datasheets.get(suggestion.entryId)
      return sheet && !wishes.data?.[suggestion.entryId] ? [{ ...suggestion, sheet }] : []
    })
    .slice(0, SUGGESTIONS_SHOWN)
  return (
    <section aria-labelledby="wishlist-heading" className="space-y-3">
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
        value=""
        onValueChange={(value) => void set((JSON.parse(value) as [string, string])[1], 1).catch(() => undefined)}
        index={(units.data ?? []).map((book) => ({ ...book, units: book.units.filter((unit) => !wishes.data?.[unit.id]) }))}
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
                      className="text-sm font-semibold break-words text-bone uppercase underline-offset-4 hover:text-info hover:underline"
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
      {suggestions.length ? (
        <div className="space-y-2">
          <h3 className="text-xs text-dim">In none of your rosters</h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map(({ entryId, rosters, of, sheet }) => (
              <li
                key={entryId}
                data-wish-suggestion={sheet.name}
                className="flex items-center gap-3 border border-dashed border-edge-strong bg-sunken/60 py-2 pr-2 pl-3"
              >
                {sheet.presentation ? (
                  <FactionMark
                    id={sheet.presentation.slug}
                    name={sheet.presentation.displayName}
                    edition={sheet.presentation.edition}
                    icon={sheet.presentation.icon}
                    size="sm"
                  />
                ) : null}
                <span className="min-w-0 flex-1">
                  <FactionReferenceLink
                    to="/factions/$catalogueId/datasheets/$entryId"
                    params={{ catalogueId: sheet.catalogueId, entryId: sheet.slug }}
                    className="inline-block max-w-full truncate align-top text-sm font-semibold text-bone uppercase underline-offset-4 hover:text-info hover:underline"
                  >
                    {sheet.name}
                  </FactionReferenceLink>
                  <span className="block text-xs text-dim">
                    {of ? `In ${rosters} of ${countLabel(of, `recent public ${sheet.faction} roster`)}` : sheet.faction}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={`Add ${sheet.name} to your wishlist`}
                  onClick={() => void set(entryId, 1).catch(() => undefined)}
                >
                  <Plus /> Add
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
