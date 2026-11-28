import type { PointsCost, VsDataDefinitions } from '../core/vsDataConstruction'
import { circumstance, costRowFor, pointsAt } from '../core/vsDataPoints'
import type { MfmUnit } from './mfm'

type Tier = {
  copies: { from: number; to?: number }
  costs: { models: number; points: number; composition?: string; mix?: Readonly<Record<string, number>> }[]
}

/**
 * A rules version's VS Data prices, by the BSData IDs its saved lists hold: each datasheet VS Data defines with the
 * cost rows of the unit it is (by `<book>/<ID>` where it is another unit in that book, null where VS Data cannot price
 * that unit, read through `inBook`), each
 * Detachment with its Detachment points and its Enhancements under their BSData names, and each book's faction, which
 * decides the cost row a unit fielded in another faction's army takes.
 */
export type VsPointsIndex = {
  books: Record<string, string>
  factions: Record<string, { name: string; parent?: string }>
  units: Record<string, { faction: string; tiers: Tier[]; wargear: { item: string; points: number }[] } | null>
  detachments: Record<
    string,
    {
      faction: string
      name: string
      dp: number | null
      enhancements: { name: string; points: number; id: string }[]
      /** The VS Data ID of each of its Enhancement options, by BSData option ID; a download saved before them has none. */
      enhancementIds?: Record<string, string>
    }
  >
}

/** The frozen maps from BSData IDs to VS Data's (`catalogue/legacy-ids/`). */
export type VsDataIds = Record<'books' | 'detachments' | 'units' | 'enhancements', Readonly<Record<string, string>>>

const priced = (points: PointsCost['points']) => (typeof points === 'number' ? points : null)

/**
 * The IDs a rules version's saved lists hold, each with the VS Data ID it reads as there: its own key first, then the
 * bare one. A datasheet one ID stands for in several factions is also held as `<book>/<ID>`, read through `inBook`.
 */
export function idsIn(map: Readonly<Record<string, string>>, edition: string | null) {
  const read = new Map<string, string>()
  for (const [key, id] of Object.entries(map)) if (!key.includes('~')) read.set(key, id)
  const prefix = edition ? `${edition}~` : null
  if (prefix) for (const [key, id] of Object.entries(map)) if (key.startsWith(prefix)) read.set(key.slice(prefix.length), id)
  return read
}

/**
 * A datasheet's entry in what is keyed as `idsIn` keys units, for a list of the book `catalogueId`: the book's own key
 * first. A book key held as null reads as none, never as the datasheet's unit in other books.
 */
export function inBook<T>(
  held: ReadonlyMap<string, T | null> | Readonly<Record<string, T | null>> | undefined,
  catalogueId: string,
  entryId: string,
): T | undefined {
  const get = (key: string) => (held instanceof Map ? held.get(key) : (held as Readonly<Record<string, T | null>> | undefined)?.[key])
  const scoped = get(`${catalogueId.slice(catalogueId.indexOf('~') + 1)}/${entryId}`)
  return (scoped === undefined ? get(entryId) : scoped) ?? undefined
}

/** The datasheet ID a key of `idsIn`'s units names, without its book. */
export const datasheetOf = (key: string) => key.slice(key.indexOf('/') + 1)

/**
 * The price index of one rules version. `nameOf` names a BSData entry: an Enhancement option, so a Detachment's
 * Enhancements are priced under the names the builder shows, with the "(Upgrade)" mark the field manual gives an
 * upgrade; and a datasheet.
 */
export function vsPointsIndex(
  definitions: VsDataDefinitions,
  ids: VsDataIds,
  edition: string | null,
  nameOf: (id: string) => string | undefined,
): VsPointsIndex {
  const units: VsPointsIndex['units'] = {}
  const unitPrice = (entryId: string, saved: string): VsPointsIndex['units'][string] => {
    const id = definitions.current(saved)
    const unit = definitions.get('unit', id)
    const name = nameOf(datasheetOf(entryId))
    if (!unit || !name || definitions.unavailable.has(id)) return null
    const row = definitions.points
      .flatMap((snapshot) => snapshot.factions.find((faction) => faction.id === unit.data.faction)?.units ?? [])
      .find((candidate) => candidate.id === id)
    if (!row) return null
    const tiers = row.tiers.map((tier) => ({
      copies: tier.copies,
      costs: tier.costs.flatMap((cost) => {
        const points = priced(cost.points)
        return points === null
          ? []
          : [
              {
                models: cost.models,
                points,
                ...(cost.composition ? { composition: cost.composition } : {}),
                ...(cost.mix ? { mix: cost.mix } : {}),
              },
            ]
      }),
    }))
    const wargear = (row.wargear ?? []).flatMap((item) => {
      const points = priced(item.points)
      return points === null ? [] : [{ item: definitions.get('wargear', item.item)?.name ?? item.item, points }]
    })
    // A size priced by a mix of models no `mix` names, which the field manual's shape cannot say, leaves the datasheet to
    // it; one whose rows give their mixes leaves only that size unpriced, for a pick read by its size alone.
    if (
      tiers.some((tier) =>
        tier.costs.some(
          (cost) =>
            !circumstance(cost.composition) &&
            tier.costs.some(
              (other) =>
                other !== cost &&
                other.models === cost.models &&
                !circumstance(other.composition) &&
                other.points !== cost.points &&
                !(cost.mix && other.mix),
            ),
        ),
      )
    )
      return null
    return { faction: unit.data.faction, tiers, wargear }
  }
  for (const [entryId, saved] of idsIn(ids.units, edition)) {
    const found = unitPrice(entryId, saved)
    if (found || entryId.includes('/')) units[entryId] = found
  }
  const enhancementIds = [...idsIn(ids.enhancements, edition)]
  const detachments: VsPointsIndex['detachments'] = {}
  for (const [optionId, id] of idsIn(ids.detachments, edition)) {
    const detachment = definitions.get('detachment', id)
    if (!detachment) continue
    const found = pointsAt(definitions.points, { kind: 'detachment', faction: detachment.data.faction, detachment: id })
    const owned = enhancementIds.flatMap(([key, enhancement]) => {
      const [owner, option] = key.split('/') as [string, string]
      return owner === id ? [[option, enhancement] as const] : []
    })
    const enhancements = owned.flatMap(([option, enhancement]) => {
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
      return [{ name: upgrade && !/\(upgrade\)$/i.test(name) ? `${name} (Upgrade)` : name, points: points.points, id: enhancement }]
    })
    // Several BSData options can name one Enhancement; the builder looks it up by name, once.
    const named = [...new Map(enhancements.map((entry) => [entry.name, entry])).values()]
    detachments[optionId] = {
      faction: detachment.data.faction,
      name: detachment.name,
      dp: found.ok ? found.points : null,
      enhancements: named,
      enhancementIds: Object.fromEntries(owned),
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
 * at each size, the cost row `costRowFor` takes there. A size whose rows leave the price open is `unpriced`.
 */
export function vsMfmUnit(
  index: VsPointsIndex | undefined,
  catalogueId: string,
  entryId: string,
  detachments: readonly string[] = [],
): MfmUnit | null {
  const unit = inBook(index?.units, catalogueId, entryId)
  if (!index || !unit) return null
  const faction = index.books[catalogueId.slice(catalogueId.indexOf('~') + 1)]
  const parent = faction ? index.factions[faction]?.parent : undefined
  const armies = [faction, parent].flatMap((id) => (id ? [id.replaceAll('-', ' '), index.factions[id]?.name ?? id] : []))
  const context = { detachments: detachments.flatMap((id) => index.detachments[id]?.name ?? []), armies }
  return {
    name: entryId,
    pricing: unit.tiers.map((tier) => {
      const sizes = [...new Set(tier.costs.map((cost) => cost.models))].map((models) => {
        const rows = tier.costs.filter((cost) => cost.models === models)
        const row = rows.length === 1 ? rows[0] : costRowFor(rows, context)
        return { models, points: typeof row?.points === 'number' ? row.points : null }
      })
      const unpriced = sizes.flatMap(({ models, points }) => (points === null ? [models] : []))
      return {
        range: rangeOf(tier.copies),
        costs: sizes.flatMap(({ models, points }) => (points === null ? [] : [{ models, points }])),
        // A size its rows leave open stays in the table, so no count is charged between the sizes either side of it.
        ...(unpriced.length ? { unpriced } : {}),
      }
    }),
    wargear: unit.wargear,
  }
}

/** A Detachment's VS Data points and Enhancements in the field manual's shape. */
export const vsMfmDetachment = (index: VsPointsIndex | undefined, detachmentId: string) => {
  const detachment = index?.detachments[detachmentId]
  return detachment && detachment.dp !== null ? { name: detachment.name, dp: detachment.dp, enhancements: detachment.enhancements } : null
}

/** Whether VS Data prices the datasheet differently in some Detachment, so a list price must be read in the list's. */
export const vsDetachmentPriced = (index: VsPointsIndex | undefined, catalogueId: string, entryId: string) =>
  Boolean(
    inBook(index?.units, catalogueId, entryId)?.tiers.some((tier) =>
      tier.costs.some((cost) => cost.composition && /^in the .+ Detachment$/.test(cost.composition)),
    ),
  )
