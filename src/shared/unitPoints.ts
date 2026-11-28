import { plainQuotes } from '../core/text'
import { cachedIn } from '../core/collections'
import { evaluate } from '../core/evaluate'
import { nameOf } from '../core/catalogue'
import { isNonMatchedPlayName, matchedPlayName, normalizedName, normalizedNameVariants } from '../core/name'
import { routeSlug } from '../core/slug'
import { buildUnit, catalogueTreeOf } from '../core/roster'
import { isResizable } from '../core/unitSize'
import type { LoadedCatalogue } from './catalogueIndex'
import { datacardOf } from './datasheetJoin'
import { factionDisplayName } from './factionNames'
import { ownChoiceOptionWargear } from '../core/modelKinds'
import type { Selection } from '../core/evaluate'
import type { ChoiceOptions, UnitChoice } from '../core/unitChoices'
import { inBook, vsMfmUnit } from './vsDataPoints'
import { rosterDetachments } from './rosterDetachments'
import { wargearOf } from '../core/wargear'
import { wargearKey } from '../core/wargearNames'
import {
  type mfmDetachmentFor,
  mfmEnhancementPoints,
  mfmWargearPoints,
  withoutUpgrade,
  mfmPrice,
  mfmSlugs,
  type MfmUnit,
  mfmWargearOptionPoints,
} from './mfm'

const cache = new WeakMap<LoadedCatalogue, Map<string, number>>()

const comparable = (name: string) => normalizedName(plainQuotes(name.replaceAll('armour', 'armor')))

const mfmUnits = new WeakMap<LoadedCatalogue, Map<string, MfmUnit | null>>()

/**
 * The price rows a datasheet is priced from in a list of `primaryCatalogueId` with `detachments`: VS Data's for a
 * datasheet it defines, else the field manual row its name matches, or null when none or several disagreeing rows do.
 */
export const mfmUnitFor = (
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  entryId: string,
  detachments: readonly string[] = [],
): MfmUnit | null =>
  cachedIn(
    mfmUnits,
    loaded,
    `${primaryCatalogueId}:${entryId}:${detachments.join(',')}`,
    () => vsMfmUnit(loaded.vsPoints, primaryCatalogueId, entryId, detachments) ?? findMfmUnit(loaded, primaryCatalogueId, entryId),
  )

/** Whether VS Data prices this datasheet, rather than the field manual. */
export const vsDataPriced = (loaded: LoadedCatalogue, catalogueId: string, entryId: string) =>
  Boolean(inBook(loaded.vsPoints?.units, catalogueId, entryId))

function findMfmUnit(loaded: LoadedCatalogue, primaryCatalogueId: string, entryId: string): MfmUnit | null {
  const book = loaded.index.catalogues.get(primaryCatalogueId)
  const entry = loaded.index.definitions.get(entryId)
  if (!book || !entry) return null
  const factionSlug = routeSlug(factionDisplayName(book.name))
  const name = nameOf(entry, loaded.index.definitions)
  // The field manual names a Legends unit without the suffix and flags it instead.
  const names = normalizedNameVariants(comparable(matchedPlayName(name)))
  for (const slug of mfmSlugs(book.name)) {
    const faction = loaded.mfm?.get(slug)
    const matched =
      faction?.units.filter(
        (unit) =>
          Boolean(unit.legends) === isNonMatchedPlayName(name) &&
          names.includes(comparable(unit.name)) &&
          (!unit.groupTitle || slug !== 'space-marines' || ['space-marines', factionSlug].includes(routeSlug(unit.groupTitle))),
      ) ?? []
    if (!matched.length) continue
    return matched.every(
      (unit) => JSON.stringify([unit.pricing, unit.wargear]) === JSON.stringify([matched[0]!.pricing, matched[0]!.wargear]),
    )
      ? matched[0]!
      : null
  }
  return null
}

function modelsIn(row: string, count: number) {
  if (/^\d+$/.test(row)) return Number(row) === count
  const range = /^(\d+)-(\d+)$/.exec(row)
  return Boolean(range && count >= Number(range[1]) && count <= Number(range[2]))
}

/** The card must give exactly one unconditional price for this model count. */
function cardPoints(loaded: LoadedCatalogue, catalogueId: string, entryId: string, models: number) {
  const rows = datacardOf(loaded, catalogueId, entryId)?.details.points ?? []
  if (rows.some((row) => row.keyword || row.faction || row.detachment)) return null
  const prices = rows.filter((row) => modelsIn(row.models, models))
  if (prices.length !== 1 || !/^\d+$/.test(prices[0]!.cost)) return null
  return Number(prices[0]!.cost)
}

/**
 * Replace the catalogue's default price with the card's current row, keeping evaluated choice and context costs.
 * Without `models`, the default unit is priced at its own size: a datasheet built without a model count can differ from
 * one built at that size, and a list price must compare against the unit it lists.
 */
export function unitPointAdjustment(
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  catalogueId: string,
  entryId: string,
  models?: number,
  copy = 1,
  detachments: readonly string[] = [],
) {
  return cachedIn(cache, loaded, JSON.stringify([primaryCatalogueId, catalogueId, entryId, models ?? null, copy, detachments]), () =>
    computeUnitPointAdjustment(loaded, primaryCatalogueId, catalogueId, entryId, models, copy, detachments),
  )
}

function computeUnitPointAdjustment(
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  catalogueId: string,
  entryId: string,
  requestedModels: number | undefined,
  copy: number,
  detachments: readonly string[],
) {
  const unit = mfmUnitFor(loaded, primaryCatalogueId, entryId, detachments)
  // VS Data prices a unit in the list's Detachments, so its price replaces the catalogue's there, Detachment upgrades the
  // catalogue adds to the unit included.
  const roster = vsDataPriced(loaded, primaryCatalogueId, entryId)
    ? rosterDetachments(loaded, primaryCatalogueId, detachments).selections
    : []
  // The Munitorum's price is for the unit at its floor; a default that costs more is charged on top, as the app does.
  const built = buildUnit(entryId, loaded.index, requestedModels, undefined, {
    primaryCatalogueId,
    mustering: true,
    floor: true,
    roster,
  })
  if (!built) return 0
  const models = requestedModels ?? built.size.models
  const fixed = !isResizable(built.size)
  const price = unit
    ? (mfmPrice(unit, models, copy) ?? (fixed ? mfmPrice(unit, 1, copy) : null))
    : (cardPoints(loaded, catalogueId, entryId, models) ?? (fixed ? cardPoints(loaded, catalogueId, entryId, 1) : null))
  if (price === null) return 0
  const comparableCopies = Math.min(copy, 6)
  const evaluated = evaluate([...roster, ...Array.from({ length: comparableCopies }, () => built.selection)], loaded.index, {
    primaryCatalogueId,
    mustering: true,
  })
  const cataloguePrice = evaluated.selectionPoints[0]?.[roster.length + comparableCopies - 1]
  return !evaluated.unhandled.length && cataloguePrice !== undefined ? price - cataloguePrice : 0
}

type MfmDetachment = NonNullable<ReturnType<typeof mfmDetachmentFor>>

/** A malformed catalogue choice must not make the whole roster impossible to price. */
export const choiceOptionsForPricing = (choice: { options?: UnitChoice['options'] }) => choice.options ?? []

function specialPoints(detachments: readonly MfmDetachment[], name: string) {
  const prices = [...new Set(detachments.flatMap((detachment) => mfmEnhancementPoints(detachment, name) ?? []))]
  return prices.length === 1 ? prices[0]! : null
}

export function mfmOptionPoints(
  detachments: readonly MfmDetachment[],
  unit: MfmUnit | null,
  choiceName: string,
  optionName: string,
  pieces: readonly { name: string; count: number }[],
  selectedCount: number,
) {
  return (
    (/enhancement|upgrade/i.test(choiceName) ? specialPoints(detachments, optionName) : null) ??
    mfmWargearOptionPoints(unit, optionName, pieces, selectedCount || 1)
  )
}

/**
 * A datasheet's price as VS Data gives it, for a datasheet VS Data prices: the cost row for its size and copy in the
 * list, every priced item it carries, by default or by choice, and the Enhancements and upgrades it takes. Null for a
 * datasheet or size VS Data does not price, which the field manual's adjustments price instead.
 */
export function vsDataUnitPoints(
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  entryId: string,
  detachmentIds: readonly string[],
  detachments: readonly MfmDetachment[],
  unit: { choices: readonly UnitChoice[]; selection?: Selection; size: { models: number } },
  copy: number,
) {
  const priced = vsMfmUnit(loaded.vsPoints, primaryCatalogueId, entryId, detachmentIds)
  const base = priced && mfmPrice(priced, unit.size.models, copy)
  if (!priced || base === null) return null
  const specials = unit.choices
    .filter((choice) => /enhancement|upgrade/i.test(choice.name))
    .flatMap((choice) =>
      choiceOptionsForPricing(choice)
        .filter((option) => option.count > 0)
        .map((option) => ({ name: option.name, points: (specialPoints(detachments, option.name) ?? option.points) * option.count })),
    )
  const specialNames = new Set(specials.map((special) => wargearKey(withoutUpgrade(special.name))))
  const items = wargearOf(catalogueTreeOf(unit), loaded.index)
    .filter((piece) => !specialNames.has(wargearKey(piece.name)))
    .reduce((total, piece) => total + (mfmWargearPoints(priced, piece.name) ?? 0) * piece.count, 0)
  return base + items + specials.reduce((total, special) => total + special.points, 0)
}

/** What the field manual's option prices add to or take off a built unit's catalogue ones. */
export function mfmOptionAdjustment(
  index: LoadedCatalogue['index'],
  unit: { choices: readonly UnitChoice[]; selection?: Selection },
  mfmUnit: MfmUnit | null,
  detachments: readonly MfmDetachment[],
  options: ChoiceOptions,
) {
  return unit.choices
    .flatMap((choice) =>
      choiceOptionsForPricing(choice).flatMap((option) => {
        if (option.count <= option.min) return []
        const pieces = ownChoiceOptionWargear(unit.choices, choice.key, option.id, catalogueTreeOf(unit), index, options)
        const price = mfmOptionPoints(detachments, mfmUnit, choice.name, option.name, pieces, option.count)
        return price === null ? [] : [(price - option.points) * (option.count - option.min)]
      }),
    )
    .reduce((total, value) => total + value, 0)
}
