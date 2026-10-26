import { canonicalDetachmentName } from '../core/detachmentName'
import { z } from 'zod'
import { joinKey } from '../core/text'
import { routeSlug } from '../core/slug'
import { normalizedNameVariants } from '../core/name'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import { grantedWargear } from './heldWargear'
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
export const factionSchema = z.object({
  slug: z.string(),
  version: z.string(),
  attribution: z.string().trim().min(1).max(500).optional(),
  detachments: z.array(detachmentSchema).optional(),
  units: z.array(unitSchema),
})
export type MfmUnit = z.infer<typeof unitSchema>
export type MfmIndex = ReadonlyMap<string, z.infer<typeof factionSchema>>
export const mfmVersions = (index: MfmIndex | null | undefined) =>
  new Set([...(index?.values() ?? [])].filter((faction) => !faction.attribution).map((faction) => faction.version))

export function mfmAttribution(index: MfmIndex | null | undefined): string | null {
  const factions = [...(index?.values() ?? [])]
  const versions = mfmVersions(index)
  const attributions = new Set<string>()
  if (versions.size) {
    attributions.add(`Points from BSData Munitorum Field Manual${versions.size === 1 ? ` ${versions.values().next().value}` : ''}`)
  }
  for (const faction of factions) if (faction.attribution) attributions.add(faction.attribution)
  return [...attributions].join('. ') || null
}
/** The MFM factions a book's points may be filed under, in order: its own, any aliases, then Space Marines for a chapter. */
export function mfmSlugs(catalogueName: string, ...aliases: string[]) {
  const marineChapter = catalogueName.includes('Adeptus Astartes') ? ['space-marines'] : []
  return [...new Set([routeSlug(factionDisplayName(catalogueName)), ...aliases, ...marineChapter])]
}
function mfmDetachment(index: MfmIndex | null | undefined, slugs: readonly string[], name: string) {
  for (const slug of slugs) {
    const matched =
      index
        ?.get(slug)
        ?.detachments?.filter(
          (detachment) => joinKey(canonicalDetachmentName(detachment.name)) === joinKey(canonicalDetachmentName(name)),
        ) ?? []
    if (matched.length) return matched.length === 1 ? matched[0]! : null
  }
  return null
}
const UPGRADE_MARK = /\s*\(upgrade\)\s*$/i
/** Upgrades are listed among a detachment's enhancements, their names marked "(upgrade)". */
export const isUpgrade = (name: string) => UPGRADE_MARK.test(name)
export const withoutUpgrade = (name: string) => name.replace(UPGRADE_MARK, '')

export function mfmEnhancementPoints(detachment: NonNullable<ReturnType<typeof mfmDetachment>>, name: string) {
  const key = (value: string) => joinKey(value.replace(/\s*\((?:aura|upgrade|one per army)\)/gi, ''))
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
  const item = grantedWargear(name)
  return item ? mfmWargearPoints(unit, item) : null
}
export function mfmDetachmentFor(loaded: LoadedCatalogue, catalogueId: string, name: string) {
  const faction = loaded.index.catalogues.get(catalogueId)
  return faction ? mfmDetachment(loaded.mfm, mfmSlugs(faction.name), name) : null
}
function copyBounds(range: string) {
  const match = /^\[(\d+),(\d*)\)$|^\[(\d+),(\d+)\]$/.exec(range)
  if (!match) return null
  const from = Number(match[1] ?? match[3])
  const to = match[2] ? Number(match[2]) : match[4] ? Number(match[4]) : Number.POSITIVE_INFINITY
  return { from, to }
}
function copyRange(range: string, copy: number) {
  const bounds = copyBounds(range)
  return bounds !== null && copy >= bounds.from && copy <= bounds.to
}
function ordinal(value: number) {
  const remainder = value % 100
  const suffix = remainder >= 11 && remainder <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][value % 10] ?? 'th')
  return `${value}${suffix}`
}
export function mfmCopyLabel(range: string) {
  const bounds = copyBounds(range)
  if (!bounds) return range
  if (!Number.isFinite(bounds.to)) return `Your ${ordinal(bounds.from)} + Unit Costs`
  return bounds.from === bounds.to
    ? `Your ${ordinal(bounds.from)} Unit Costs`
    : `Your ${ordinal(bounds.from)} To ${ordinal(bounds.to)} Units Cost`
}
export function mfmPrice(unit: MfmUnit, models: number, copy: number): number | null {
  const tiers = unit.pricing.filter((tier) => copyRange(tier.range, copy))
  if (tiers.length !== 1) return null
  const costs = tiers[0]!.costs.filter((cost) => !cost.addon).toSorted((left, right) => left.models - right.models)
  const prices = costs.filter((cost) => cost.models === models)
  if (prices.length) return prices.length === 1 ? prices[0]!.points : null
  // MFM Starting Strength guidance (https://mfm.warhammer-community.com/en): only a two-row table charges counts between its rows, at the upper row.
  return costs.length === 2 && models > costs[0]!.models && models < costs[1]!.models ? costs[1]!.points : null
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
        ...(tier.range === '[1,)' ? {} : { copies: tier.label ?? mfmCopyLabel(tier.range) }),
      })),
  )
}
