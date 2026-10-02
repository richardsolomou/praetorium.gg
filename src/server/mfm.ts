import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { z } from 'zod'
import { joinKey } from './rulesSource'
import { routeSlug } from '../core/slug'
import { normalizedNameVariants } from '../core/name'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'

const costSchema = z.object({ models: z.number().int().positive(), points: z.number().int().nonnegative(), addon: z.boolean().optional() })
const tierSchema = z.object({ range: z.string(), label: z.string().optional(), costs: z.array(costSchema) })
const unitSchema = z.object({
  name: z.string(),
  groupTitle: z.string().optional(),
  legends: z.boolean().optional(),
  pricing: z.array(tierSchema),
  wargear: z.array(z.object({ item: z.string(), points: z.number().int().nonnegative() })).optional(),
})
const enhancementSchema = z.object({ name: z.string(), points: z.number().int().nonnegative() })
const detachmentSchema = z.object({
  name: z.string(),
  dp: z.number().int().nonnegative(),
  enhancements: z.array(enhancementSchema).optional(),
})
const factionSchema = z.object({
  slug: z.string(),
  version: z.string(),
  detachments: z.array(detachmentSchema).optional(),
  units: z.array(unitSchema),
})

export type MfmUnit = z.infer<typeof unitSchema>
export type MfmIndex = ReadonlyMap<string, z.infer<typeof factionSchema>>

export function mfmAttribution(index: MfmIndex | null | undefined): string | null {
  const versions = new Set([...(index?.values() ?? [])].map((faction) => faction.version))
  if (!versions.size) return null
  return `Points from BSData Munitorum Field Manual${versions.size === 1 ? ` ${versions.values().next().value}` : ''}`
}

export function mfmDetachment(index: MfmIndex | null | undefined, faction: string, name: string, marineChapter = false) {
  const slugs = [faction, ...(marineChapter && faction !== 'space-marines' ? ['space-marines'] : [])]
  for (const slug of slugs) {
    const matched = index?.get(slug)?.detachments?.filter((detachment) => joinKey(detachment.name) === joinKey(name)) ?? []
    if (matched.length) return matched.length === 1 ? matched[0]! : null
  }
  return null
}

export function mfmEnhancementPoints(detachment: NonNullable<ReturnType<typeof mfmDetachment>>, name: string) {
  const key = (value: string) => joinKey(value.replace(/\s*\((?:aura|upgrade)\)/gi, ''))
  const matched = detachment.enhancements?.filter((enhancement) => key(enhancement.name) === key(name)) ?? []
  return matched.length === 1 ? matched[0]!.points : null
}

function mfmWargearPoints(unit: MfmUnit | null, name: string) {
  const keys = new Set(normalizedNameVariants(name).map(joinKey))
  const matched = unit?.wargear?.filter((row) => normalizedNameVariants(row.item).some((variant) => keys.has(joinKey(variant)))) ?? []
  return matched.length === 1 ? matched[0]!.points : null
}

export function mfmWargearOptionPoints(
  unit: MfmUnit | null,
  name: string,
  pieces: readonly { name: string; count: number }[],
  selectedCount = 1,
) {
  const costs = pieces.flatMap((piece) => {
    const price = mfmWargearPoints(unit, piece.name)
    return price === null ? [] : [(price * piece.count) / selectedCount]
  })
  if (costs.length) return costs.reduce((total, price) => total + price, 0)
  const direct = mfmWargearPoints(unit, name)
  if (direct !== null) return direct
  const item = /\b(?:replaced|equipped) with\s+\d+\s+(.+)$/i.exec(name)?.[1]?.replace(/\.$/, '')
  return item ? mfmWargearPoints(unit, item) : null
}

export function mfmDetachmentFor(loaded: LoadedCatalogue, catalogueId: string, name: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  return faction
    ? mfmDetachment(loaded.mfm, routeSlug(factionDisplayName(faction.name)), name, faction.name.includes('Adeptus Astartes'))
    : null
}

export function loadMfm(directory: string): MfmIndex | null {
  const points = path.join(directory, 'points', 'data')
  if (!fs.existsSync(points)) return null
  const factions = new Map<string, z.infer<typeof factionSchema>>()
  for (const file of fs.readdirSync(points).filter((name) => name.endsWith('.yaml') && name !== 'meta.yaml')) {
    const faction = factionSchema.parse(parse(fs.readFileSync(path.join(points, file), 'utf8')))
    if (factions.has(faction.slug)) throw new Error(`duplicate MFM faction ${faction.slug}`)
    factions.set(faction.slug, faction)
  }
  return factions
}

function copyRange(range: string, copy: number) {
  const match = /^\[(\d+),(\d*)\)$|^\[(\d+),(\d+)\]$/.exec(range)
  if (!match) return false
  const from = Number(match[1] ?? match[3])
  const to = match[2] ? Number(match[2]) : match[4] ? Number(match[4]) : Number.POSITIVE_INFINITY
  return copy >= from && copy <= to
}

export function mfmPrice(unit: MfmUnit, models: number, copy: number): number | null {
  const tiers = unit.pricing.filter((tier) => copyRange(tier.range, copy))
  if (tiers.length !== 1) return null
  const prices = tiers[0]!.costs.filter((cost) => !cost.addon && cost.models === models)
  return prices.length === 1 ? prices[0]!.points : null
}

export function mfmFirstCopyRows(unit: MfmUnit) {
  const tier = unit.pricing.find((candidate) => copyRange(candidate.range, 1))
  return tier?.costs.filter((cost) => !cost.addon) ?? []
}

export function mfmCostRows(unit: MfmUnit) {
  return unit.pricing.flatMap((tier) =>
    tier.costs
      .filter((cost) => !cost.addon)
      .map((cost) => ({
        models: String(cost.models),
        cost: String(cost.points),
        keyword: null,
        faction: null,
        detachment: null,
        ...(tier.range === '[1,)' ? {} : { copies: tier.label ?? tier.range }),
      })),
  )
}
