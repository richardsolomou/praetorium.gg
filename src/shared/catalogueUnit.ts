import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate, type Selection } from '../core/evaluate'
import { cachedIn } from '../core/collections'
import { isNonMatchedPlayName } from '../core/name'
import { buildUnit } from '../core/roster'
import { unitReadsRoster } from '../core/unitRosterDependence'
import type { LoadedCatalogue } from './catalogueIndex'
import { mfmOptionAdjustment, mfmUnitFor, unitPointAdjustment, vsDataUnitPoints } from './unitPoints'
import { vsDetachmentPriced } from './vsDataPoints'
import { vsDefinitionsOf, vsPickPrices, vsUnitIdOf } from './vsDataBuild'
import { vsFirstPickOf } from './vsDataPicks'
import { vsBuiltUnit } from '../core/vsDataBuild'

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
  const changesWithDetachment =
    unitReadsRoster(entryId, loaded.index, detachments) || vsDetachmentPriced(loaded.vsPoints, catalogueId, entryId)
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
  const detachmentIds = detachmentIdsIn(loaded, catalogueId, roster)
  const native = vsFirstPrices(loaded, catalogueId, entryId, detachmentIds, copies)
  if (native) return native
  const options = { primaryCatalogueId: catalogueId, mustering: true, roster }
  // A datasheet's listed price is the Munitorum's, for the unit at its floor; a default that costs more is charged once fielded.
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { ...options, floor: true })
  if (!built) return null
  const vsData = copies.flatMap((copy) => vsDataUnitPoints(loaded, catalogueId, entryId, detachmentIds, [], built, copy) ?? [])
  if (vsData.length === copies.length) return vsData
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

/**
 * For a datasheet the builder adds as a VS pick, what that first pick costs as each copy, priced by VS Data alone; none
 * for any other datasheet, or where VS Data leaves the pick unpriced.
 */
function vsFirstPrices(
  loaded: LoadedCatalogue,
  catalogueId: string,
  entryId: string,
  detachmentIds: readonly string[],
  copies: readonly number[],
) {
  const pick = vsFirstPickOf(loaded, { catalogueId, detachmentIds }, entryId)
  const definitions = pick && vsDefinitionsOf(loaded)
  const unit = definitions && vsUnitIdOf(loaded, catalogueId, entryId)
  if (!pick || !definitions || !unit) return null
  const vs = vsBuiltUnit(definitions, unit, pick)
  // Copies are counted across the list, so the nth copy's price is the nth of n alike.
  const units = Array.from({ length: Math.max(...copies) }, () => ({ entryId, vs }))
  const prices = vsPickPrices(loaded, { catalogueId, detachmentIds, limit: 0 }, units)
  const found = copies.map((copy) => prices.get(copy - 1))
  return found.every((price): price is number => price !== undefined) ? found : null
}

/** The Detachment options a list's roster selections hold. */
function detachmentIdsIn(loaded: LoadedCatalogue, catalogueId: string, roster: readonly Selection[]) {
  const options = new Set(loaded.detachments.get(catalogueId)?.options.map((option) => option.id))
  const found: string[] = []
  const walk = (selection: Selection) => {
    if (options.has(selection.id)) found.push(selection.id)
    selection.selections?.forEach(walk)
  }
  roster.forEach(walk)
  return found
}
