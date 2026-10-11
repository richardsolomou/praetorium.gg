import { z } from 'zod'
import type { CombatCarrier } from './combatLoadout'
import { wargearKey, type Wargear } from './wargear'

export const collectionLotSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(120),
  models: z.number().int().min(0).max(10_000),
  builds: z
    .array(z.string().min(1).max(2_048))
    .min(1)
    .max(16)
    .refine((keys) => new Set(keys).size === keys.length),
})
export type CollectionLot = z.infer<typeof collectionLotSchema>
export const collectionStockSchema = z
  .array(collectionLotSchema)
  .max(200)
  .refine((lots) => new Set(lots.map((lot) => lot.id)).size === lots.length)
  .refine((lots) => JSON.stringify(lots).length <= 1_000_000)
export const collectionLotUpdateSchema = z
  .strictObject({
    lot: collectionLotSchema,
    expected: collectionLotSchema.nullable(),
    remove: z.boolean().default(false),
  })
  .refine(({ lot, expected }) => !expected || lot.id === expected.id)
export type CollectionLotUpdate = z.infer<typeof collectionLotUpdateSchema>
export type CollectionDemand = { key: string | null; entryId: string; name: string; equipment: string; models: number }

export function collectionDemands(
  entryId: string,
  name: string,
  carriers: readonly CombatCarrier[],
  models: number,
  allEquipment: readonly Wargear[] = [],
): CollectionDemand[] {
  const allocated = carriers.flatMap((carrier) => carrier.weapons)
  const unmatched = allEquipment.some(
    (piece) =>
      allocated
        .filter((weapon) => wargearKey(weapon.name, true) === wargearKey(piece.name, true))
        .reduce((total, weapon) => total + weapon.count, 0) < piece.count,
  )
  if (
    unmatched ||
    carriers.some((carrier) => carrier.unitWide) ||
    carriers.reduce((total, carrier) => total + carrier.models, 0) !== models
  )
    return [{ key: null, entryId, name, equipment: 'Equipment allocation needs review', models }]
  return carriers
    .filter((carrier) => carrier.models > 0)
    .map((carrier) => {
      const equipment = carrier.weapons
        .map((weapon) => [weapon.name, weapon.count / carrier.models] as const)
        .toSorted(([a], [b]) => a.localeCompare(b))
      const key = equipment.some(([, count]) => !Number.isInteger(count)) ? null : JSON.stringify([entryId, carrier.name, equipment])
      return {
        key: key && key.length <= 2_048 ? key : null,
        entryId,
        name: name === carrier.name ? name : `${name}: ${carrier.name}`,
        equipment: equipment.map(([weapon, count]) => `${count > 1 ? `${count}× ` : ''}${weapon}`).join(', ') || 'No selected equipment',
        models: carrier.models,
      }
    })
}

export function collectionRequirements(demands: readonly CollectionDemand[]): CollectionDemand[] {
  const grouped = new Map<string, CollectionDemand>()
  for (const demand of demands) {
    const key = JSON.stringify([demand.entryId, demand.key])
    grouped.set(key, { ...demand, models: (grouped.get(key)?.models ?? 0) + demand.models })
  }
  return [...grouped.values()]
}

export function updateCollectionStock(stock: readonly CollectionLot[], update: CollectionLotUpdate): CollectionLot[] {
  if (
    !matchesCollectionUpdate(
      stock.find((lot) => lot.id === update.lot.id),
      update,
    )
  )
    throw new Error('This physical stock changed. Review the current count before saving again.')
  const other = stock.filter((lot) => lot.id !== update.lot.id)
  return update.remove ? other : collectionStockSchema.parse([...other, update.lot])
}

export function matchesCollectionUpdate(current: CollectionLot | undefined, update: CollectionLotUpdate) {
  return JSON.stringify(current ?? null) === JSON.stringify(update.expected)
}

type Edge = { to: number; capacity: number; reverse: number }

/** Residual paths let dedicated stock free shared models without counting any model twice. */
export function collectionShortages(demands: readonly CollectionDemand[], stock: readonly CollectionLot[]) {
  if (demands.length > 1_000 || stock.length > 200) throw new Error('Collection comparison exceeds the supported size.')
  const source = 0
  const sink = 1 + stock.length + demands.length
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => [])
  const add = (from: number, to: number, capacity: number) => {
    const edge = { to, capacity, reverse: graph[to]!.length }
    graph[from]!.push(edge)
    graph[to]!.push({ to: from, capacity: 0, reverse: graph[from]!.length - 1 })
    return edge
  }
  const demandEdges = demands.map((demand, at) => add(1 + stock.length + at, sink, demand.models))
  stock.forEach((lot, at) => {
    add(source, at + 1, lot.models)
    const builds = new Set(lot.builds)
    demands.forEach((demand, index) => {
      if (demand.key && builds.has(demand.key)) add(at + 1, 1 + stock.length + index, demand.models)
    })
  })
  while (true) {
    const paths = new Map<number, { from: number; edge: Edge }>()
    const queue = [source]
    for (let position = 0; position < queue.length && !paths.has(sink); position++) {
      const from = queue[position]!
      for (const edge of graph[from]!) {
        if (edge.capacity <= 0 || edge.to === source || paths.has(edge.to)) continue
        paths.set(edge.to, { from, edge })
        queue.push(edge.to)
      }
    }
    if (!paths.has(sink)) break
    let capacity = Number.MAX_SAFE_INTEGER
    for (let at = sink; at !== source;) {
      const path = paths.get(at)!
      capacity = Math.min(capacity, path.edge.capacity)
      at = path.from
    }
    for (let at = sink; at !== source;) {
      const path = paths.get(at)!
      path.edge.capacity -= capacity
      graph[at]![path.edge.reverse]!.capacity += capacity
      at = path.from
    }
  }
  return demands.map((demand, at) => ({
    ...demand,
    missing: demandEdges[at]!.capacity,
    allocated: demand.models - demandEdges[at]!.capacity,
  }))
}
