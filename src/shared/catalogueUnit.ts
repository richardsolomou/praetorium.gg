import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate, type Selection } from '../core/evaluate'
import { cachedIn } from '../core/collections'
import { isNonMatchedPlayName } from '../core/name'
import { buildUnit } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'
import { mfmOptionAdjustment, mfmUnitFor, unitPointAdjustment } from './unitPoints'

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

/** What the smallest legal version of one datasheet costs, or null if it cannot be built. */
export function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string, roster: readonly Selection[] = []) {
  const options = { primaryCatalogueId: catalogueId, mustering: true, roster }
  const built = buildUnit(entryId, loaded.index, undefined, undefined, options)
  if (!built) return null
  const mfmUnit = mfmUnitFor(loaded, catalogueId, entryId)
  const wargearAdjustment = mfmOptionAdjustment(loaded.index, built, mfmUnit, [], options)
  return (
    evaluate([...roster, built.selection], loaded.index, options).selectionPoints[0]![roster.length]! +
    unitPointAdjustment(loaded, catalogueId, catalogueId, entryId, built.size.models) +
    wargearAdjustment
  )
}
