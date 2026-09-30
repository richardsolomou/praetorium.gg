import { evaluate } from '../core/evaluate'
import { buildUnit } from '../core/roster'
import type { LoadedCatalogue } from './catalogueIndex'
import { datacardOf } from './datasheetJoin'

const cache = new WeakMap<LoadedCatalogue, Map<string, number>>()

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
) {
  const key = JSON.stringify([primaryCatalogueId, catalogueId, entryId, models])
  const saved = cache.get(loaded)?.get(key)
  if (saved !== undefined) return saved
  const card = cardPoints(loaded, catalogueId, entryId, models)
  const built = card === null ? null : buildUnit(entryId, loaded.index, models, undefined, { primaryCatalogueId, mustering: true })
  const evaluated = built ? evaluate([built.selection], loaded.index, { primaryCatalogueId, mustering: true }) : null
  const adjustment = evaluated && !evaluated.unhandled.length ? card! - evaluated.points : 0
  const entries = cache.get(loaded) ?? new Map<string, number>()
  entries.set(key, adjustment)
  cache.set(loaded, entries)
  return adjustment
}
