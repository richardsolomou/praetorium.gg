import { boundedProgress, type CollectionProgress } from './collection'

export type ReadinessRow = {
  entryId: string
  name: string
  units: number
  needed: number
  /** The owned, built and painted models assigned to this datasheet, never more than it needs. */
  owned: number
  built: number
  painted: number
  wanted: number
  /** Models counted under other datasheets that the player says also count as this one. */
  from: { entryId: string; models: number }[]
  /** Models to buy: every roster unit of a datasheet draws on the same models, so two units compete for them. */
  short: number
  toBuild: number
  toPaint: number
}

type Pool = { entryId: string; supplies: string[]; painted: number; built: number; owned: number }

/**
 * Assigns each pool's models to the datasheets they count as, painted models first, then built, then the rest.
 *
 * Augmenting paths never lower a pool's or datasheet's assignment, so each stage keeps the last and every total is the most any assignment reaches.
 */
function allocate(needs: ReadonlyMap<string, number>, pools: readonly Pool[]) {
  const flow = pools.map(() => new Map<string, number>())
  const received = new Map<string, number>()
  const used = pools.map(() => 0)
  const stages = (['painted', 'built', 'owned'] as const).map((stage) => {
    for (;;) {
      const path = augmentingPath(stage)
      if (!path) break
      const last = path.at(-1)!.entryId
      let amount = Math.min(pools[path[0]!.pool]![stage] - used[path[0]!.pool]!, needs.get(last)! - (received.get(last) ?? 0))
      for (const step of path.slice(1)) amount = Math.min(amount, flow[step.pool]!.get(step.from!)!)
      for (const step of path) {
        const pool = flow[step.pool]!
        pool.set(step.entryId, (pool.get(step.entryId) ?? 0) + amount)
        if (step.from !== undefined) pool.set(step.from, pool.get(step.from)! - amount)
      }
      used[path[0]!.pool]! += amount
      received.set(last, (received.get(last) ?? 0) + amount)
    }
    return new Map(received)
  })
  return { painted: stages[0]!, built: stages[1]!, owned: stages[2]!, flow }

  /** Breadth-first from pools with models left to datasheets still short, moving earlier assignments aside where another pool can take over. */
  function augmentingPath(stage: 'painted' | 'built' | 'owned') {
    type Step = { pool: number; entryId: string; from?: string; previous?: Step }
    const queue: Step[] = []
    const visited = new Set<string>()
    pools.forEach((pool, index) => {
      if (pool[stage] <= used[index]!) return
      for (const entryId of pool.supplies)
        if (!visited.has(entryId)) {
          visited.add(entryId)
          queue.push({ pool: index, entryId })
        }
    })
    for (let step = queue.shift(); step; step = queue.shift()) {
      if ((received.get(step.entryId) ?? 0) < needs.get(step.entryId)!) {
        const path: Step[] = []
        for (let at: Step | undefined = step; at; at = at.previous) path.unshift(at)
        return path
      }
      for (const [index, pool] of pools.entries()) {
        if (!flow[index]!.get(step.entryId)) continue
        for (const entryId of pool.supplies)
          if (!visited.has(entryId)) {
            visited.add(entryId)
            queue.push({ pool: index, entryId, from: step.entryId, previous: step })
          }
      }
    }
    return null
  }
}

/**
 * How far a player's collection is from fielding a roster, by datasheet.
 *
 * Models counted under one datasheet can fill any datasheet the player says they also count as, and are counted once wherever they go.
 * Equipment is not counted, so a mixed loadout reads as ready whenever there are enough models.
 */
export function rosterReadiness(
  units: readonly { entryId: string; name: string; models: number }[],
  collection: {
    counts: Readonly<Record<string, number>>
    progress: Readonly<Record<string, CollectionProgress>>
    wishes: Readonly<Record<string, number>>
    countsAs?: Readonly<Record<string, readonly string[]>>
  },
) {
  const needs = new Map<string, { entryId: string; name: string; units: number; needed: number }>()
  for (const unit of units) {
    const row = needs.get(unit.entryId) ?? { entryId: unit.entryId, name: unit.name, units: 0, needed: 0 }
    row.units++
    row.needed += unit.models
    needs.set(unit.entryId, row)
  }
  const pools = Object.entries(collection.counts).flatMap(([entryId, owned]): Pool[] => {
    const supplies = [entryId, ...(collection.countsAs?.[entryId] ?? [])].filter(
      (id, index, ids) => needs.has(id) && ids.indexOf(id) === index,
    )
    const { built, painted } = boundedProgress(owned, collection.progress[entryId] ?? { built: 0, painted: 0 })
    return owned > 0 && supplies.length ? [{ entryId, supplies, painted, built, owned }] : []
  })
  const allocation = allocate(new Map([...needs].map(([entryId, row]) => [entryId, row.needed])), pools)
  const datasheets = [...needs.values()].map((row): ReadinessRow => {
    const owned = allocation.owned.get(row.entryId) ?? 0
    const built = allocation.built.get(row.entryId) ?? 0
    const painted = allocation.painted.get(row.entryId) ?? 0
    return {
      ...row,
      owned,
      built,
      painted,
      wanted: collection.wishes[row.entryId] ?? 0,
      from: pools.flatMap((pool, index) => {
        const models = allocation.flow[index]!.get(row.entryId) ?? 0
        return pool.entryId !== row.entryId && models ? [{ entryId: pool.entryId, models }] : []
      }),
      short: row.needed - owned,
      toBuild: owned - built,
      toPaint: built - painted,
    }
  })
  const total = (field: 'needed' | 'short' | 'toBuild' | 'toPaint' | 'painted') => datasheets.reduce((sum, row) => sum + row[field], 0)
  return {
    datasheets,
    needed: total('needed'),
    short: total('short'),
    toBuild: total('toBuild'),
    toPaint: total('toPaint'),
    painted: total('painted'),
  }
}

export type RosterReadiness = ReturnType<typeof rosterReadiness>
