import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate } from '../core/evaluate'
import { isNonMatchedPlayName } from '../core/name'
import { buildUnit } from '../core/roster'
import { choiceOptionWargear } from '../core/modelKinds'
import type { LoadedCatalogue } from './catalogueIndex'
import { mfmUnitFor, unitPointAdjustment } from './unitPoints'
import { mfmWargearOptionPoints } from './mfm'

export function isMatchedPlayDatasheet(index: CatalogueIndex, entry: Definition) {
  const target = targetOf(entry, index.definitions)
  if (entry.hidden || target.hidden || isNonMatchedPlayName(nameOf(entry, index.definitions))) return false
  if ([...(entry.categoryLinks ?? []), ...(target.categoryLinks ?? [])].some((link) => link.primary && link.name === 'Reference'))
    return false
  const ownerId = index.catalogueOf.get(target.id)
  return !ownerId || index.catalogues.get(ownerId)?.name !== 'Unaligned Forces'
}

/** What the smallest legal version of one datasheet costs, or null if it cannot be built. */
export function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: catalogueId })
  if (!built) return null
  const mfmUnit = mfmUnitFor(loaded, catalogueId, entryId)
  const wargearAdjustment = built.choices
    .flatMap((choice) =>
      choice.options.flatMap((option) => {
        const pieces = choiceOptionWargear(choice.key, option.id, built.selection, loaded.index, { primaryCatalogueId: catalogueId })
        const price = mfmWargearOptionPoints(mfmUnit, option.name, pieces, option.count || 1)
        return option.count > option.min && price !== null ? [(price - option.points) * (option.count - option.min)] : []
      }),
    )
    .reduce((total, difference) => total + difference, 0)
  return (
    evaluate([built.selection], loaded.index, { primaryCatalogueId: catalogueId }).points +
    unitPointAdjustment(loaded, catalogueId, catalogueId, entryId, built.size.models) +
    wargearAdjustment
  )
}
