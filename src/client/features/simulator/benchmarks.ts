import { z } from 'zod'
import type { combatUnits } from '../../functions'
import type { CombatRoster } from './useCombatant'
import { parseStored } from '../../storedValue'

export type CombatUnitIndex = Awaited<ReturnType<typeof combatUnits>>
const targetSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(200)
    .default(() => crypto.randomUUID()),
  catalogueId: z.string().min(1).max(200),
  entryId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  models: z.int().min(1).max(200).optional(),
})
const targetsSchema = z.array(targetSchema).max(50)
export type BenchmarkTarget = z.infer<typeof targetSchema>

const DEFAULT_BENCHMARKS = [
  ['Astra Militarum', 'Cadian Shock Troops'],
  ['Necrons', 'Necron Warriors'],
  ['Space Marines', 'Intercessor Squad'],
  ['Space Marines', 'Heavy Intercessor Squad'],
  ['Space Marines', 'Terminator Assault Squad'],
  ['Space Marines', 'Rhino'],
  ['Space Marines', 'Ballistus Dreadnought'],
  ['Astra Militarum', 'Leman Russ Battle Tank'],
  ['Space Marines', 'Land Raider'],
] as const

export function defaultBenchmarkTargets(index: CombatUnitIndex) {
  const targets: BenchmarkTarget[] = []
  const missing: string[] = []
  for (const [faction, name] of DEFAULT_BENCHMARKS) {
    const book = index.find((candidate) => candidate.name === faction)
    const unit = book?.units.find((candidate) => candidate.name === name)
    if (book && unit)
      targets.push({ key: `${book.catalogueId}:${unit.id}`, catalogueId: book.catalogueId, entryId: unit.id, name: unit.name })
    else missing.push(name)
  }
  return { targets, missing }
}

export function parseBenchmarkTargets(raw: string | null): BenchmarkTarget[] | null {
  if (!raw || raw.length > 32_000) return null
  return parseStored(targetsSchema, raw)
}

export function benchmarkRosters(targets: readonly BenchmarkTarget[], index: CombatUnitIndex): CombatRoster[] {
  if (!targets.length) throw new Error('Add at least one benchmark target.')
  return targetsSchema.parse(targets).map((target) => {
    if (!index.some((book) => book.catalogueId === target.catalogueId && book.units.some((unit) => unit.id === target.entryId)))
      throw new Error(`${target.name} is unavailable under its selected rules. Replace it or reset the benchmarks.`)
    return {
      catalogueId: target.catalogueId,
      detachmentIds: [],
      disposition: null,
      limit: 2000,
      picks: [{ entryId: target.entryId, ...(target.models === undefined ? {} : { models: target.models }) }],
      pickIndex: 0,
      waivedRules: [],
      borrowedDetachmentId: null,
      optionalRules: [],
    }
  })
}
