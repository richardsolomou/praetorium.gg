import { evaluate } from '../core/evaluate'
import { nameOf } from '../core/catalogue'
import { isNonMatchedPlayName, normalizedName, normalizedNameVariants } from '../core/name'
import { routeSlug } from '../core/slug'
import { buildUnit } from '../core/roster'
import { isResizable } from '../core/unitSize'
import type { LoadedCatalogue } from './catalogueIndex'
import { datacardOf } from './datasheetJoin'
import { factionDisplayName } from './factionNames'
import { mfmPrice, type MfmUnit } from './mfm'

const cache = new WeakMap<LoadedCatalogue, Map<string, number>>()

const comparable = (name: string) => normalizedName(name.replaceAll('armour', 'armor').replaceAll(/[‘’ʼ]/g, "'"))

export function mfmUnitFor(loaded: LoadedCatalogue, primaryCatalogueId: string, entryId: string): MfmUnit | null {
  const book = loaded.index.catalogues.get(primaryCatalogueId)
  const entry = loaded.index.definitions.get(entryId)
  if (!book || !entry) return null
  const factionSlug = routeSlug(factionDisplayName(book.name))
  const names = normalizedNameVariants(comparable(nameOf(entry, loaded.index.definitions)))
  const slugs = [factionSlug, ...(book.name.includes('Adeptus Astartes') && factionSlug !== 'space-marines' ? ['space-marines'] : [])]
  for (const slug of slugs) {
    const faction = loaded.mfm?.get(slug)
    const matched =
      faction?.units.filter(
        (unit) =>
          Boolean(unit.legends) === isNonMatchedPlayName(nameOf(entry, loaded.index.definitions)) &&
          names.includes(comparable(unit.name)) &&
          (!unit.groupTitle || slug !== 'space-marines' || ['space-marines', factionSlug].includes(routeSlug(unit.groupTitle))),
      ) ?? []
    if (!matched.length) continue
    return matched.every(
      (unit) => JSON.stringify([unit.pricing, unit.wargear]) === JSON.stringify([matched[0]!.pricing, matched[0]!.wargear]),
    )
      ? matched[0]!
      : null
  }
  return null
}

function modelsIn(row: string, count: number) {
  if (/^\d+$/.test(row)) return Number(row) === count
  const range = /^(\d+)-(\d+)$/.exec(row)
  return Boolean(range && count >= Number(range[1]) && count <= Number(range[2]))
}

/** The card must give exactly one unconditional price for this model count. */
function cardPoints(loaded: LoadedCatalogue, catalogueId: string, entryId: string, models: number) {
  const rows = datacardOf(loaded, catalogueId, entryId)?.details.points ?? []
  if (rows.some((row) => row.keyword || row.faction || row.detachment)) return null
  const prices = rows.filter((row) => modelsIn(row.models, models))
  if (prices.length !== 1 || !/^\d+$/.test(prices[0]!.cost)) return null
  return Number(prices[0]!.cost)
}

/** Replace the catalogue's default price with the card's current row, keeping evaluated choice and context costs. */
export function unitPointAdjustment(
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  catalogueId: string,
  entryId: string,
  models: number,
  copy = 1,
) {
  const key = JSON.stringify([primaryCatalogueId, catalogueId, entryId, models, copy])
  const saved = cache.get(loaded)?.get(key)
  if (saved !== undefined) return saved
  const unit = mfmUnitFor(loaded, primaryCatalogueId, entryId)
  const built = buildUnit(entryId, loaded.index, models, undefined, { primaryCatalogueId, mustering: true })
  const fixed = built && !isResizable(built.size)
  const price = unit
    ? (mfmPrice(unit, models, copy) ?? (fixed ? mfmPrice(unit, 1, copy) : null))
    : (cardPoints(loaded, catalogueId, entryId, models) ?? (fixed ? cardPoints(loaded, catalogueId, entryId, 1) : null))
  const comparableCopies = Math.min(copy, 6)
  const evaluated =
    built && price !== null
      ? evaluate(
          Array.from({ length: comparableCopies }, () => built.selection),
          loaded.index,
          { primaryCatalogueId, mustering: true },
        )
      : null
  const cataloguePrice = evaluated?.selectionPoints[0]?.[comparableCopies - 1]
  const adjustment = evaluated && !evaluated.unhandled.length && cataloguePrice !== undefined ? price! - cataloguePrice : 0
  const entries = cache.get(loaded) ?? new Map<string, number>()
  entries.set(key, adjustment)
  cache.set(loaded, entries)
  return adjustment
}
