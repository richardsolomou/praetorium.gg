import fs from 'node:fs'
import path from 'node:path'
import type { LoadedCatalogue } from './catalogueIndex'
import { factionDirectories } from './rulesSource'

export type SourceUnit = {
  id: string
  name: string
  keywords: string[]
  factionKeywords: string[]
  profiles: { name: string; values: Record<string, string | number> }[]
  points: { models: number; modelsMax: number | null; cost: number }[]
  modelCount: { min: number; max: number } | null
  baseSize:
    | { shape: 'round'; diameter: number }
    | { shape: 'oval'; width: number; length: number }
    | { shape: 'hull' | 'unique'; draft: boolean }
    | { shape: 'flying-base'; size: 'small' | 'large'; width: number | null; length: number | null; draft: boolean }
    | null
}

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [])

function parseBaseSize(value: unknown): SourceUnit['baseSize'] {
  if (!value || typeof value !== 'object') return null
  const base = value as Record<string, unknown>
  if (base.shape === 'round' && typeof base.diameter === 'number') return { shape: 'round', diameter: base.diameter }
  if (base.shape === 'oval' && typeof base.width === 'number' && typeof base.length === 'number') {
    return { shape: 'oval', width: base.width, length: base.length }
  }
  if ((base.shape === 'hull' || base.shape === 'unique') && typeof base.draft === 'boolean') {
    return { shape: base.shape, draft: base.draft }
  }
  if (base.shape === 'flying-base' && (base.size === 'small' || base.size === 'large') && typeof base.draft === 'boolean') {
    return {
      shape: base.shape,
      size: base.size,
      width: typeof base.width === 'number' ? base.width : null,
      length: typeof base.length === 'number' ? base.length : null,
      draft: base.draft,
    }
  }
  return null
}

function parseModelCount(value: unknown): SourceUnit['modelCount'] {
  if (!value || typeof value !== 'object') return null
  const count = value as Record<string, unknown>
  return typeof count.min === 'number' && typeof count.max === 'number' ? { min: count.min, max: count.max } : null
}

function parseSourceUnit(value: unknown): SourceUnit | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  const profiles = Array.isArray(record.profiles)
    ? record.profiles.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') return []
        const profile = candidate as Record<string, unknown>
        if (typeof profile.name !== 'string') return []
        const values = Object.fromEntries(
          Object.entries(profile).filter(
            (entry): entry is [string, string | number] => entry[0] !== 'name' && ['string', 'number'].includes(typeof entry[1]),
          ),
        )
        return [{ name: profile.name, values }]
      })
    : []
  const points = Array.isArray(record.points)
    ? record.points.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') return []
        const point = candidate as Record<string, unknown>
        return typeof point.models === 'number' && typeof point.cost === 'number'
          ? [{ models: point.models, modelsMax: typeof point.models_max === 'number' ? point.models_max : null, cost: point.cost }]
          : []
      })
    : []
  return {
    id: record.id,
    name: record.name,
    keywords: stringList(record.keywords),
    factionKeywords: stringList(record.faction_keywords),
    profiles,
    points,
    modelCount: parseModelCount(record.model_count),
    baseSize: parseBaseSize(record.base_size_mm),
  }
}

export function loadSourceUnits(core: string): ReadonlyMap<string, readonly SourceUnit[]> {
  const units = new Map<string, SourceUnit[]>()
  if (!fs.existsSync(core)) return units
  for (const faction of factionDirectories(core)) {
    const file = path.join(core, faction, 'units.json')
    if (!fs.existsSync(file)) continue
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!Array.isArray(parsed)) continue
    for (const candidate of parsed) {
      const unit = parseSourceUnit(candidate)
      if (!unit || !candidate || typeof candidate !== 'object') continue
      const record = candidate as Record<string, unknown>
      for (const reference of Array.isArray(record.external_refs) ? record.external_refs : []) {
        if (!reference || typeof reference !== 'object') continue
        const external = reference as Record<string, unknown>
        if (external.namespace !== 'bsdata' || typeof external.id !== 'string') continue
        units.set(external.id, [...(units.get(external.id) ?? []), unit])
      }
    }
  }
  return units
}

export type SourceUnitJoin = { unit: SourceUnit; method: 'external-reference' }

export function sourceUnitOf(loaded: LoadedCatalogue, definitionId: string): SourceUnitJoin | null {
  const candidates = loaded.sourceUnits.get(definitionId) ?? []
  if (!candidates.length) return null
  const first = candidates[0]!
  return candidates.every((candidate) => JSON.stringify(candidate) === JSON.stringify(first))
    ? { unit: first, method: 'external-reference' }
    : null
}

export function sourceBaseSize(base: SourceUnit['baseSize']): string | null {
  if (!base) return null
  if (base.shape === 'round') return `${base.diameter}mm`
  if (base.shape === 'oval') return `${base.width} x ${base.length}mm Oval Base`
  if (base.shape === 'flying-base') return `${base.size === 'small' ? 'Small' : 'Large'} Flying Base`
  return base.shape === 'hull' ? 'Hull' : 'Unique'
}

export function sourceCosts(points: readonly SourceUnit['points'][number][]) {
  const byModels = new Map<string, Set<number>>()
  for (const point of points) {
    const models = point.modelsMax === null ? String(point.models) : `${point.models}-${point.modelsMax}`
    const costs = byModels.get(models) ?? new Set<number>()
    costs.add(point.cost)
    byModels.set(models, costs)
  }
  return [...byModels]
    .flatMap(([models, costs]) =>
      costs.size === 1 ? [{ models, cost: String(costs.values().next().value!), keyword: null, faction: null, detachment: null }] : [],
    )
    .toSorted((left, right) => Number.parseInt(left.models, 10) - Number.parseInt(right.models, 10))
}

export function sourceComposition(modelCount: SourceUnit['modelCount']): string[] {
  if (!modelCount) return []
  if (modelCount.min === modelCount.max) return [`${modelCount.min} ${modelCount.min === 1 ? 'model' : 'models'}`]
  return [`${modelCount.min}-${modelCount.max} models`]
}
