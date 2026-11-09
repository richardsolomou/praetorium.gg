import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate, type Selection } from '../core/evaluate'
import { cachedIn } from '../core/collections'
import { isNonMatchedPlayName } from '../core/name'
import { buildUnit } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'
import { mfmOptionAdjustment, mfmUnitFor, pricingChoices, unitPointAdjustment } from './unitPoints'

export const isMatchedPlayDatasheet = (index: CatalogueIndex, entry: Definition) => isOfferedDatasheet(index, entry, false)

/** Whether a roster may take the datasheet, counting Legends and Crucible ones only when `nonMatchedPlay` asks for them. */
export function isOfferedDatasheet(index: CatalogueIndex, entry: Definition, nonMatchedPlay: boolean) {
  const target = targetOf(entry, index.definitions)
  const marked = isNonMatchedPlayName(nameOf(entry, index.definitions))
  if (entry.hidden || target.hidden || (marked && !nonMatchedPlay)) return false
  if ([...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])].some((link) => link.primary && link.name === 'Reference'))
    return false
  // Unaligned Forces also holds mission-only battlefield assets, some without the Legends suffix.
  const ownerId = index.catalogueOf.get(target.id)
  return !ownerId || index.catalogues.get(ownerId)?.name !== 'Unaligned Forces' || marked
}

const listPriceCache = new WeakMap<LoadedCatalogue, Map<string, number | null>>()

/** `priceOf` outside any roster, which a book's datasheet pages and its lists without a battle size or detachment all show. */
export const listPriceOf = (loaded: LoadedCatalogue, catalogueId: string, entryId: string) =>
  cachedIn(listPriceCache, loaded, `${catalogueId}:${entryId}`, () => priceOf(loaded, catalogueId, entryId))

export const seedListPrice = (loaded: LoadedCatalogue, catalogueId: string, entryId: string, points: number | null) =>
  cachedIn(listPriceCache, loaded, `${catalogueId}:${entryId}`, () => points)

/** What the smallest legal version of one datasheet costs as the list's `copy`th of it, or null if it cannot be built. */
export function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string, roster: readonly Selection[] = [], copy = 1) {
  const options = { primaryCatalogueId: catalogueId, mustering: true, roster, choiceCache: pricingChoices }
  const built = buildUnit(entryId, loaded.index, undefined, undefined, options)
  if (!built) return null
  const mfmUnit = mfmUnitFor(loaded, catalogueId, entryId)
  const wargearAdjustment = mfmOptionAdjustment(loaded.index, built, mfmUnit, [], options)
  const copies = Array.from({ length: Math.min(copy, MAX_PRICED_COPY) }, () => built.selection)
  return (
    evaluate([...roster, ...copies], loaded.index, options).selectionPoints[0]![roster.length + copies.length - 1]! +
    unitPointAdjustment(loaded, catalogueId, catalogueId, entryId, undefined, copy) +
    wargearAdjustment
  )
}

const MAX_PRICED_COPY = 6

/** The second and later copies' prices, for a datasheet whose points table charges copies differently. */
export function laterCopyPrices(loaded: LoadedCatalogue, catalogueId: string, entryId: string, roster: readonly Selection[]) {
  if ((mfmUnitFor(loaded, catalogueId, entryId)?.pricing.length ?? 0) < 2) return undefined
  const prices = Array.from({ length: MAX_PRICED_COPY - 1 }, (_, index) => priceOf(loaded, catalogueId, entryId, roster, index + 2))
  return prices.every((price) => price !== null) ? prices : undefined
}
