import { cachedIn } from '../core/collections'
import { attachmentPartyOf } from '../core/attach'
import type { Selection } from '../core/evaluate'
import { defaultSelection } from '../core/expand'
import { routeSlug } from '../core/slug'
import type { PickerUnit } from '../contracts/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import { detachmentUnitFacts, unitSummaries, unitsIn } from './cataloguePicker'
import { factionDisplayName } from './factionNames'
import type { LoadedCatalogue } from './catalogueIndex'
import { rosterDetachments } from './rosterDetachments'
import type { LoadedRules } from './rules'
import { type Steps, stepThrough } from './steps'

const attachmentCache = new WeakMap<
  LoadedCatalogue,
  Map<string, Pick<PickerUnit, 'attachment' | 'attachmentLimits' | 'attachmentCategories' | 'unattachable'>>
>()

function pickerAttachments(loaded: LoadedCatalogue, catalogueId: string, entryId: string) {
  return cachedIn(attachmentCache, loaded, `${catalogueId}:${entryId}`, () => {
    const definition = loaded.index.definitions.get(entryId)!
    return attachmentPartyOf(
      definition,
      loaded.index,
      defaultSelection(entryId, loaded.index, { primaryCatalogueId: catalogueId }) ?? undefined,
    )
  })
}

/** Search reads the keywords the chosen detachments grant, as Abhuman Auxiliaries makes Ratlings ABHUMAN. */
function pickerSearchFields(loaded: LoadedCatalogue, catalogueId: string, entryId: string, detachments: readonly Selection[]) {
  const fields = datasheetSearchFieldsIn(loaded, catalogueId, entryId)
  const granted = detachmentUnitFacts(loaded, catalogueId, entryId, detachments)?.keywords
  return fields && granted ? { ...fields, keywords: [...new Set([...fields.keywords, ...granted])] } : fields
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
  const detachments = rosterDetachments(loaded, catalogueId, detachmentIds).selections
  return unitsIn(loaded, catalogueId, query, { restrictions, battleSize, waivedRules, detachmentIds, nonMatchedPlay: true }).map(
    (unit) => ({
      ...unit,
      ...pickerAttachments(loaded, catalogueId, unit.id),
      alliedFaction: unit.alliedFaction ? factionDisplayName(unit.alliedFaction, names) : null,
      search: pickerSearchFields(loaded, catalogueId, unit.id, detachments),
    }),
  )
}

/** Prepares what a faction's unpriced picker and reference list read, a datasheet per step. */
export function* pickerConstruction(loaded: LoadedCatalogue, rules: LoadedRules | null, catalogueId: string): Steps<void> {
  yield* stepThrough(unitSummaries(loaded, catalogueId, { factionCards: true, nonMatchedPlay: true }))
  yield* pickerSteps(loaded, rules, catalogueId)
}

/** Builds everything `pickerUnitsFor` reads for one roster's picker, a datasheet per step. */
export function* pickerSteps(
  loaded: LoadedCatalogue,
  rules: LoadedRules | null,
  catalogueId: string,
  battleSize?: number,
  waivedRules: readonly string[] = [],
  detachmentIds: readonly string[] = [],
): Steps<void> {
  const restrictions = pickerRestrictions(loaded, rules, catalogueId)
  const units = yield* stepThrough(
    unitSummaries(loaded, catalogueId, { restrictions, battleSize, waivedRules, detachmentIds, nonMatchedPlay: true }),
  )
  const detachments = rosterDetachments(loaded, catalogueId, detachmentIds).selections
  for (const unit of units) {
    pickerAttachments(loaded, catalogueId, unit.id)
    pickerSearchFields(loaded, catalogueId, unit.id, detachments)
    yield
  }
}

/** The books whose picker lists a datasheet, which are the rosters a reference page can add it to. */
export function booksOffering(loaded: LoadedCatalogue, rules: LoadedRules | null, entryId: string, catalogueIds: readonly string[]) {
  return catalogueIds.filter((catalogueId) =>
    unitsIn(loaded, catalogueId, '', { restrictions: pickerRestrictions(loaded, rules, catalogueId), nonMatchedPlay: true }).some(
      (unit) => unit.id === entryId,
    ),
  )
}
