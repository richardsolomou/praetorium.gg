import { canonicalDetachmentName } from '../core/detachmentName'
import { z } from 'zod'
import { joinKey, placingLabel } from '../core/text'
import { routeSlug } from '../core/slug'
import { normalizedNameVariants } from '../core/name'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import { grantedWargear } from './heldWargear'
import { vsMfmDetachment } from './vsDataPoints'
const costSchema = z.object({ models: z.number().int().positive(), points: z.number().int().nonnegative(), addon: z.boolean().optional() })
const tierSchema = z.object({
  range: z.string(),
  label: z.string().optional(),
  costs: z.array(costSchema),
  /** Model counts the table prints with no one price, as a size VS Data prices by its mix of models. */
  unpriced: z.array(z.number().int().positive()).optional(),
})
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
const UPGRADE_MARK = /\s*\((?:upgrade|upgarde)\)\s*$/i
/** Upgrades are listed among a detachment's enhancements, their names marked "(upgrade)", or "(Upgarde)" in older app data. */
export const isUpgrade = (name: string) => UPGRADE_MARK.test(name)
export const withoutUpgrade = (name: string) => name.replace(UPGRADE_MARK, '')

/** Sources disagree on which printed qualifiers an enhancement's name carries, so names are joined without them. */
export const enhancementKey = (name: string) => joinKey(name.replace(/\s*\((?:aura|upgrade|upgarde|one per army|psychic)\)/gi, ''))

type FieldManualDetachment = z.infer<typeof detachmentSchema>
type DetachmentPrices = {
  enhancements?: readonly { name: string; points: number }[]
  /** The field manual's Detachment of that name, which prices an Enhancement VS Data's leaves out. */
  fieldManual?: FieldManualDetachment
}

/** A Detachment's price for the Enhancement `name`, or null where none or several of its own name it. */
function ownEnhancementPoints(detachment: DetachmentPrices, name: string) {
  const matched = detachment.enhancements?.filter((enhancement) => enhancementKey(enhancement.name) === enhancementKey(name)) ?? []
  return matched.length === 1 ? matched[0]!.points : null
}

/** Whether a Detachment prices the Enhancement `name` from the field manual, for one VS Data's Detachment leaves out. */
export const fieldManualPricesEnhancement = (detachment: DetachmentPrices, name: string) =>
  Boolean(detachment.fieldManual) &&
  !detachment.enhancements?.some((enhancement) => enhancementKey(enhancement.name) === enhancementKey(name)) &&
  ownEnhancementPoints(detachment.fieldManual!, name) !== null

export function mfmEnhancementPoints(detachment: DetachmentPrices, name: string) {
  return fieldManualPricesEnhancement(detachment, name)
    ? ownEnhancementPoints(detachment.fieldManual!, name)
    : ownEnhancementPoints(detachment, name)
}
export function mfmWargearPoints(unit: MfmUnit | null, name: string) {
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
/**
 * A Detachment's points and Enhancement prices: VS Data's for a Detachment it records, with the field manual's beside
 * them for an Enhancement VS Data's leaves out, else the field manual's by name.
 */
export function mfmDetachmentFor(loaded: LoadedCatalogue, catalogueId: string, name: string) {
  const option = loaded.detachments.get(catalogueId)?.options.filter((candidate) => candidate.name === name)
  const vsData = option?.length === 1 ? vsMfmDetachment(loaded.vsPoints, option[0]!.id) : null
  const fieldManual = fieldManualDetachment(loaded, catalogueId, name)
  return vsData ? { ...vsData, ...(fieldManual ? { fieldManual } : {}) } : fieldManual
}

/** A Detachment as the field manual prints it, by name, whose spellings imports also read. */
export function fieldManualDetachment(loaded: LoadedCatalogue, catalogueId: string, name: string) {
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
export function mfmCopyLabel(range: string) {
  const bounds = copyBounds(range)
  if (!bounds) return range
  if (!Number.isFinite(bounds.to)) return `Your ${placingLabel(bounds.from)} + Unit Costs`
  return bounds.from === bounds.to
    ? `Your ${placingLabel(bounds.from)} Unit Costs`
    : `Your ${placingLabel(bounds.from)} To ${placingLabel(bounds.to)} Units Cost`
}
export function mfmPrice(unit: MfmUnit, models: number, copy: number): number | null {
  const tiers = unit.pricing.filter((tier) => copyRange(tier.range, copy))
  if (tiers.length !== 1) return null
  const costs = tiers[0]!.costs.filter((cost) => !cost.addon).toSorted((left, right) => left.models - right.models)
  const prices = costs.filter((cost) => cost.models === models)
  if (prices.length) return prices.length === 1 ? prices[0]!.points : null
  // MFM Starting Strength guidance (https://mfm.warhammer-community.com/en): only a two-row table charges counts between its rows, at the upper row.
  return costs.length === 2 && !tiers[0]!.unpriced?.length && models > costs[0]!.models && models < costs[1]!.models
    ? costs[1]!.points
    : null
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
