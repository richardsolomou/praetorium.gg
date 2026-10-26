import { plainQuotes } from '../core/text'
import { cachedIn } from '../core/collections'
import { evaluate } from '../core/evaluate'
import { nameOf } from '../core/catalogue'
import { isNonMatchedPlayName, matchedPlayName, normalizedName, normalizedNameVariants } from '../core/name'
import { routeSlug } from '../core/slug'
import { buildUnit } from '../core/roster'
import { isResizable } from '../core/unitSize'
import type { LoadedCatalogue } from './catalogueIndex'
import { datacardOf } from './datasheetJoin'
import { factionDisplayName } from './factionNames'
import { ownChoiceOptionWargear } from '../core/modelKinds'
import type { Selection } from '../core/evaluate'
import type { ChoiceOptions, UnitChoice } from '../core/unitChoices'
import { type mfmDetachmentFor, mfmEnhancementPoints, mfmPrice, mfmSlugs, type MfmUnit, mfmWargearOptionPoints } from './mfm'

const cache = new WeakMap<LoadedCatalogue, Map<string, number>>()

const comparable = (name: string) => normalizedName(plainQuotes(name.replaceAll('armour', 'armor')))

export function mfmUnitFor(loaded: LoadedCatalogue, primaryCatalogueId: string, entryId: string): MfmUnit | null {
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

/** Replace the catalogue's default price with the card's current row, keeping evaluated choice and context costs. */
export function unitPointAdjustment(
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  catalogueId: string,
  entryId: string,
  models: number,
  copy = 1,
) {
  return cachedIn(cache, loaded, JSON.stringify([primaryCatalogueId, catalogueId, entryId, models, copy]), () =>
    computeUnitPointAdjustment(loaded, primaryCatalogueId, catalogueId, entryId, models, copy),
  )
}

function computeUnitPointAdjustment(
  loaded: LoadedCatalogue,
  primaryCatalogueId: string,
  catalogueId: string,
  entryId: string,
  models: number,
  copy: number,
) {
  const unit = mfmUnitFor(loaded, primaryCatalogueId, entryId)
  const built = buildUnit(entryId, loaded.index, models, undefined, { primaryCatalogueId, mustering: true })
  const fixed = built && !isResizable(built.size)
  const price = unit
    ? (mfmPrice(unit, models, copy) ?? (fixed ? mfmPrice(unit, 1, copy) : null))
    : (cardPoints(loaded, catalogueId, entryId, models) ?? (fixed ? cardPoints(loaded, catalogueId, entryId, 1) : null))
  const comparableCopies = Math.min(copy, 6)
  const evaluated =
    built && price !== null
      ? evaluate(
          Array.from({ length: comparableCopies }, () => built.selection),
          loaded.index,
          { primaryCatalogueId, mustering: true },
        )
      : null
  const cataloguePrice = evaluated?.selectionPoints[0]?.[comparableCopies - 1]
  return evaluated && !evaluated.unhandled.length && cataloguePrice !== undefined ? price! - cataloguePrice : 0
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

/** What the field manual's option prices add to or take off a built unit's catalogue ones. */
export function mfmOptionAdjustment(
  index: LoadedCatalogue['index'],
  unit: { choices: readonly UnitChoice[]; selection: Selection },
  mfmUnit: MfmUnit | null,
  detachments: readonly MfmDetachment[],
  options: ChoiceOptions,
) {
  return unit.choices
    .flatMap((choice) =>
      choiceOptionsForPricing(choice).flatMap((option) => {
        if (option.count <= option.min) return []
        const pieces = ownChoiceOptionWargear(unit.choices, choice.key, option.id, unit.selection, index, options)
        const price = mfmOptionPoints(detachments, mfmUnit, choice.name, option.name, pieces, option.count)
        return price === null ? [] : [(price - option.points) * (option.count - option.min)]
      }),
    )
    .reduce((total, value) => total + value, 0)
}
