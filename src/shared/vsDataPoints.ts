import type { PointsCost, VsDataDefinitions } from '../core/vsDataConstruction'
import { costRowFor, pointsAt } from '../core/vsDataPoints'
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
 * upgrade; and a datasheet, which VS Data prices only where both mark it Warhammer Legends alike, so a Legends
 * datasheet aliased to its current namesake keeps its own price.
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
    if (!unit || !name || definitions.unavailable.has(id) || (nonMatchedPlayKind(name) === 'legends') !== Boolean(unit.data.legends))
      continue
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
      const upgrade = definitions.get('enhancement', enhancement)?.data.type === 'upgrade'
      return [{ name: upgrade && !/\(upgrade\)$/i.test(name) ? `${name} (Upgrade)` : name, points: points.points }]
    })
    detachments[optionId] = { faction: detachment.data.faction, name: detachment.name, dp: found.ok ? found.points : null, enhancements }
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
