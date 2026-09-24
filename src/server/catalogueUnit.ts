import { type CatalogueIndex, type Definition, nameOf, targetOf } from '../core/catalogue'
import { evaluate } from '../core/evaluate'
import { isNonMatchedPlayName } from '../core/name'
import { buildUnit } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'

export function isMatchedPlayDatasheet(index: CatalogueIndex, entry: Definition) {
  const target = targetOf(entry, index.definitions)
  if (entry.hidden || target.hidden || isNonMatchedPlayName(nameOf(entry, index.definitions))) return false
  const ownerId = index.catalogueOf.get(target.id)
  return !ownerId || index.catalogues.get(ownerId)?.name !== 'Unaligned Forces'
}

/** What the smallest legal version of one datasheet costs, or null if it cannot be built. */
export function priceOf(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: catalogueId })
  if (!built) return null
  return evaluate([built.selection], loaded.index, { primaryCatalogueId: catalogueId }).points
}
