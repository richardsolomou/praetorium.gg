import type { PointsCost, VsDataDefinitions } from '../core/vsDataConstruction'
import { circumstance, costRowFor, pointsAt } from '../core/vsDataPoints'
import { nonMatchedPlayKind } from '../core/name'
import type { MfmUnit } from './mfm'

type Tier = { copies: { from: number; to?: number }; costs: { models: number; points: number; composition?: string }[] }

/**
 * A rules version's VS Data prices, by the BSData IDs its saved lists hold: each datasheet VS Data defines with the
 * cost rows of the unit it is, each Detachment with its Detachment points and its Enhancements under their BSData
 * names, and each book's faction, which decides the cost row a unit fielded in another faction's army takes.
 */
export type VsPointsIndex = {
  books: Record<string, string>
  factions: Record<string, { name: string; parent?: string }>
  units: Record<string, { faction: string; tiers: Tier[]; wargear: { item: string; points: number }[] }>
  detachments: Record<string, { faction: string; name: string; dp: number | null; enhancements: { name: string; points: number }[] }>
}

/** The frozen maps from BSData IDs to VS Data's (`catalogue/legacy-ids/`). */
export type VsDataIds = Record<'books' | 'detachments' | 'units' | 'enhancements', Readonly<Record<string, string>>>

const priced = (points: PointsCost['points']) => (typeof points === 'number' ? points : null)

/** The IDs a rules version's saved lists hold, each with the VS Data ID it reads as there: its own key first, then the bare one. */
function idsIn(map: Readonly<Record<string, string>>, edition: string | null) {
  const read = new Map<string, string>()
  for (const [key, id] of Object.entries(map)) if (!key.includes('~')) read.set(key, id)
  const prefix = edition ? `${edition}~` : null
  if (prefix) for (const [key, id] of Object.entries(map)) if (key.startsWith(prefix)) read.set(key.slice(prefix.length), id)
  return read
}

/**
 * The price index of one rules version. `nameOf` names a BSData entry: an Enhancement option, so a Detachment's
 * Enhancements are priced under the names the builder shows, with the "(Upgrade)" mark the field manual gives an
 * upgrade; and a datasheet. A Warhammer Legends datasheet keeps the field manual's price until VS Data's own Legends
 * records are settled: one Legends unit can stand for two of them, the app's and the Legends field manual's, at two prices.
 */
export function vsPointsIndex(
  definitions: VsDataDefinitions,
  ids: VsDataIds,
  edition: string | null,
  nameOf: (id: string) => string | undefined,
): VsPointsIndex {
  const units: VsPointsIndex['units'] = {}
  for (const [entryId, id] of idsIn(ids.units, edition)) {
    const unit = definitions.get('unit', id)
    const name = nameOf(entryId)
    if (!unit || !name || definitions.unavailable.has(id) || unit.data.legends || nonMatchedPlayKind(name) === 'legends') continue
    const row = definitions.points
      .flatMap((snapshot) => snapshot.factions.find((faction) => faction.id === unit.data.faction)?.units ?? [])
      .find((candidate) => candidate.id === id)
    if (!row) continue
    const tiers = row.tiers.map((tier) => ({
      copies: tier.copies,
      costs: tier.costs.flatMap((cost) => {
        const points = priced(cost.points)
        return points === null ? [] : [{ models: cost.models, points, ...(cost.composition ? { composition: cost.composition } : {}) }]
      }),
    }))
    const wargear = (row.wargear ?? []).flatMap((item) => {
      const points = priced(item.points)
      return points === null ? [] : [{ item: definitions.get('wargear', item.item)?.name ?? item.item, points }]
    })
    // A size priced by its mix of models, which the field manual's shape cannot say, leaves the datasheet to it.
    if (
      tiers.some((tier) =>
        tier.costs.some(
          (cost) =>
            !circumstance(cost.composition) &&
            tier.costs.some(
              (other) => other !== cost && other.models === cost.models && !circumstance(other.composition) && other.points !== cost.points,
            ),
        ),
      )
    )
      continue
    units[entryId] = { faction: unit.data.faction, tiers, wargear }
  }
  const enhancementIds = [...idsIn(ids.enhancements, edition)]
  const detachments: VsPointsIndex['detachments'] = {}
  for (const [optionId, id] of idsIn(ids.detachments, edition)) {
    const detachment = definitions.get('detachment', id)
    if (!detachment) continue
    const found = pointsAt(definitions.points, { kind: 'detachment', faction: detachment.data.faction, detachment: id })
    const enhancements = enhancementIds.flatMap(([key, enhancement]) => {
      const [owner, option] = key.split('/') as [string, string]
      if (owner !== id) return []
      const points = pointsAt(definitions.points, { kind: 'enhancement', faction: detachment.data.faction, detachment: id, enhancement })
      const name = nameOf(option)
      if (!points.ok || !name) return []
      const upgrade = definitions.points.some((snapshot) =>
        snapshot.factions.some((faction) =>
          faction.detachments.some(
            (candidate) => candidate.id === id && candidate.enhancements.some((entry) => entry.id === enhancement && entry.upgrade),
          ),
        ),
      )
      return [{ name: upgrade && !/\(upgrade\)$/i.test(name) ? `${name} (Upgrade)` : name, points: points.points }]
    })
    // Several BSData options can name one Enhancement; the builder looks it up by name, once.
    const named = [...new Map(enhancements.map((entry) => [entry.name, entry])).values()]
    detachments[optionId] = {
      faction: detachment.data.faction,
      name: detachment.name,
      dp: found.ok ? found.points : null,
      enhancements: named,
    }
  }
  const factions = Object.fromEntries(
    definitions
      .all('faction')
      .map((faction) => [faction.id, { name: faction.name, ...(faction.data.parent ? { parent: faction.data.parent } : {}) }]),
  )
  return { books: Object.fromEntries(idsIn(ids.books, edition)), factions, units, detachments }
}

const rangeOf = ({ from, to }: Tier['copies']) => (to === undefined ? `[${from},)` : `[${from},${to}]`)

/**
 * A datasheet's VS Data prices in the field manual's shape, for a list of the book `catalogueId` with `detachments`:
 * at each size, the cost row `costRowFor` takes there. A size whose rows leave the price open has none.
 */
export function vsMfmUnit(
  index: VsPointsIndex | undefined,
  catalogueId: string,
  entryId: string,
  detachments: readonly string[] = [],
): MfmUnit | null {
  const unit = index?.units[entryId]
  if (!index || !unit) return null
  const faction = index.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const parent = faction ? index.factions[faction]?.parent : undefined
  const armies = [faction, parent].flatMap((id) => (id ? [id.replaceAll('-', ' '), index.factions[id]?.name ?? id] : []))
  const context = { detachments: detachments.flatMap((id) => index.detachments[id]?.name ?? []), armies }
  return {
    name: entryId,
    pricing: unit.tiers.map((tier) => ({
      range: rangeOf(tier.copies),
      costs: [...new Set(tier.costs.map((cost) => cost.models))].flatMap((models) => {
        const rows = tier.costs.filter((cost) => cost.models === models)
        const row = rows.length === 1 ? rows[0] : costRowFor(rows, context)
        return row && typeof row.points === 'number' ? [{ models, points: row.points }] : []
      }),
    })),
    wargear: unit.wargear,
  }
}

/** A Detachment's VS Data points and Enhancements in the field manual's shape. */
export const vsMfmDetachment = (index: VsPointsIndex | undefined, detachmentId: string) => {
  const detachment = index?.detachments[detachmentId]
  return detachment && detachment.dp !== null ? { name: detachment.name, dp: detachment.dp, enhancements: detachment.enhancements } : null
}

/** Whether VS Data prices the datasheet differently in some Detachment, so a list price must be read in the list's. */
export const vsDetachmentPriced = (index: VsPointsIndex | undefined, entryId: string) =>
  Boolean(
    index?.units[entryId]?.tiers.some((tier) =>
      tier.costs.some((cost) => cost.composition && /^in the .+ Detachment$/.test(cost.composition)),
    ),
  )
