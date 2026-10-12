import { attachmentOf, attachmentLimitsOf, attachmentCategoriesOf } from '../core/attach'
import { defaultSelection } from '../core/expand'
import { routeSlug } from '../core/slug'
import type { PickerUnit } from '../contracts/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import { unitsIn } from './cataloguePicker'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import type { LoadedRules } from './rules'

const attachmentCache = new WeakMap<
  LoadedCatalogue,
  Map<string, Pick<PickerUnit, 'attachment' | 'attachmentLimits' | 'attachmentCategories'>>
>()

function pickerAttachments(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  const key = `${catalogueId}:${entryId}`
  const cached = attachmentCache.get(loaded)
  const existing = cached?.get(key)
  if (existing) return existing
  const definition = loaded.index.definitions.get(entryId)!
  const facts = {
    attachment: attachmentOf(
      definition,
      loaded.index,
      defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId }) ?? undefined,
    ),
    attachmentLimits: attachmentLimitsOf(definition, loaded.index),
    attachmentCategories: attachmentCategoriesOf(definition, loaded.index),
  }
  const entries = cached ?? new Map()
  entries.set(key, facts)
  if (!cached) attachmentCache.set(loaded, entries)
  return facts
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

/** The books whose picker lists a datasheet, which are the rosters a reference page can add it to. */
export function booksOffering(loaded: LoadedCatalogue, rules: LoadedRules | null, entryId: string, catalogueIds: readonly string[]) {
  return catalogueIds.filter((catalogueId) =>
    unitsIn(loaded, catalogueId, '', { restrictions: pickerRestrictions(loaded, rules, catalogueId) }).some((unit) => unit.id === entryId),
  )
}
