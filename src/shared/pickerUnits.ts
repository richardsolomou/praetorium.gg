import { cachedIn } from '../core/collections'
import { attachmentOf, attachmentLimitsOf, attachmentCategoriesOf } from '../core/attach'
import { defaultSelection } from '../core/expand'
import { routeSlug } from '../core/slug'
import type { PickerUnit } from '../contracts/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import { unitSummaries, unitsIn } from './cataloguePicker'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'
import { type Steps, stepThrough } from './steps'

const attachmentCache = new WeakMap<
  LoadedCatalogue,
  Map<string, Pick<PickerUnit, 'attachment' | 'attachmentLimits' | 'attachmentCategories'>>
>()

function pickerAttachments(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  return cachedIn(attachmentCache, loaded, `${catalogueId}:${entryId}`, () => {
    const definition = loaded.index.definitions.get(entryId)!
    return {
      attachment: attachmentOf(
        definition,
        loaded.index,
        defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId }) ?? undefined,
      ),
      attachmentLimits: attachmentLimitsOf(definition, loaded.index),
      attachmentCategories: attachmentCategoriesOf(definition, loaded.index),
    }
  })
}

function pickerRestrictions(loaded: LoadedCatalogue, rules: LoadedRules | null, catalogueId: string) {
  const book = loaded.factions.find((entry) => entry.id === catalogueId)
  const displayName = book ? factionDisplayName(book.name, rules?.factionNames) : ''
  return rules?.factionRestrictions.get(routeSlug(displayName))
}

export function pickerUnitsFor(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  catalogueId: string,
  query: string,
  battleSize?: number,
  waivedRules: readonly string[] = [],
  detachmentIds: readonly string[] = [],
): PickerUnit[] {
  const names = rules?.factionNames
  const restrictions = pickerRestrictions(loaded, rules, catalogueId)
  return unitsIn(loaded, catalogueId, query, { restrictions, battleSize, waivedRules, detachmentIds }).map((unit) => ({
    ...unit,
    ...pickerAttachments(loaded, catalogueId, unit.id),
    alliedFaction: unit.alliedFaction ? factionDisplayName(unit.alliedFaction, names) : null,
    search: datasheetSearchFieldsIn(loaded, catalogueId, unit.id),
  }))
}

/** Prepares what a faction's unpriced picker and reference list read, a datasheet per step. */
export function* pickerConstruction(loaded: LoadedCatalogue, rules: LoadedRules | null, catalogueId: string): Steps<void> {
  yield* stepThrough(unitSummaries(loaded, catalogueId, { factionCards: true }))
  const units = yield* stepThrough(unitSummaries(loaded, catalogueId, { restrictions: pickerRestrictions(loaded, rules, catalogueId) }))
  for (const unit of units) {
    pickerAttachments(loaded, catalogueId, unit.id)
    datasheetSearchFieldsIn(loaded, catalogueId, unit.id)
    yield
  }
}

/** The books whose picker lists a datasheet, which are the rosters a reference page can add it to. */
export function booksOffering(loaded: LoadedCatalogue, rules: LoadedRules | null, entryId: string, catalogueIds: readonly string[]) {
  return catalogueIds.filter((catalogueId) =>
    unitsIn(loaded, catalogueId, '', { restrictions: pickerRestrictions(loaded, rules, catalogueId) }).some((unit) => unit.id === entryId),
  )
}
