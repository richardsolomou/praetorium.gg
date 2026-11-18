import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate, type Selection } from '../core/evaluate'
import { cachedIn } from '../core/collections'
import { isNonMatchedPlayName } from '../core/name'
import { buildUnit } from '../core/roster'
import { unitReadsRoster } from '../core/unitRosterDependence'
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

export const seedListPrice = (loaded: LoadedCatalogue, catalogueId: string, entryId: string, points: number | null) =>
  cachedIn(listPriceCache, loaded, `${catalogueId}:${entryId}`, () => points)

/** What the smallest legal version of one datasheet costs as the list's `copy`th of it, or null if it cannot be built. */
export const priceOf = (loaded: LoadedCatalogue, catalogueId: string, entryId: string, roster: readonly Selection[] = [], copy = 1) =>
  copyPrices(loaded, catalogueId, entryId, roster, [copy])?.[0] ?? null

const MAX_PRICED_COPY = 6
const pricedCopies = Array.from({ length: MAX_PRICED_COPY }, (_, index) => index + 1)
const bookPrices = new WeakMap<LoadedCatalogue, Map<string, ReturnType<typeof copyPrices>>>()

/**
 * What the datasheet costs in a roster, and its second and later copies' prices when its points table charges copies
 * differently.
 */
export function rosterPrices(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  detachments: readonly Selection[],
  battleSize: Selection | null = null,
) {
  const tiered = (mfmUnitFor(loaded, catalogueId, entryId)?.pricing.length ?? 0) >= 2
  const copies = tiered ? pricedCopies : [1]
  const size = battleSize ? [battleSize] : []
  const changesWithDetachment = unitReadsRoster(entryId, loaded.index, detachments)
  const base = !changesWithDetachment && unitReadsRoster(entryId, loaded.index, size) ? size : []
  if (!changesWithDetachment && !base.length && !tiered)
    return { points: listPriceOf(loaded, catalogueId, entryId), laterCopyPoints: undefined }
  const prices = changesWithDetachment
    ? copyPrices(loaded, catalogueId, entryId, [...size, ...detachments], copies)
    : cachedIn(bookPrices, loaded, JSON.stringify([catalogueId, entryId, base[0]?.id]), () =>
        copyPrices(loaded, catalogueId, entryId, base, copies),
      )
  return { points: prices?.[0] ?? null, laterCopyPoints: tiered ? prices?.slice(1) : undefined }
}

/** `priceOf` for each copy, building the unit once since the build does not depend on how many copies the list holds. */
function copyPrices(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  roster: readonly Selection[],
  copies: readonly number[],
) {
  const options = { primaryCatalogueId: catalogueId, mustering: true, roster }
  const built = buildUnit(entryId, loaded.index, undefined, undefined, options)
  if (!built) return null
  const mfmUnit = mfmUnitFor(loaded, catalogueId, entryId)
  const wargearAdjustment = mfmOptionAdjustment(loaded.index, built, mfmUnit, [], options)
  return copies.map((copy) => {
    const selections = Array.from({ length: Math.min(copy, MAX_PRICED_COPY) }, () => built.selection)
    return (
      evaluate([...roster, ...selections], loaded.index, options).selectionPoints[0]![roster.length + selections.length - 1]! +
      unitPointAdjustment(loaded, catalogueId, catalogueId, entryId, undefined, copy) +
      wargearAdjustment
    )
  })
}
