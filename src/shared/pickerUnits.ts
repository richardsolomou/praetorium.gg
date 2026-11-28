import { cachedIn } from '../core/collections'
import { attachmentPartyOf } from '../core/attach'
import type { Selection } from '../core/evaluate'
import { defaultSelection } from '../core/expand'
import type { PickerUnit, UnitSummary } from '../contracts/catalogue'
import { datasheetSearchFieldsIn } from './catalogue'
import { detachmentUnitFacts, seedUnitSummaries, type UnitListOptions, unitSummaries, unitsIn } from './cataloguePicker'
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
  const detachments = rosterDetachments(loaded, catalogueId, detachmentIds).selections
  return unitsIn(loaded, catalogueId, query, { battleSize, waivedRules, detachmentIds, nonMatchedPlay: true }).map((unit) => ({
    ...unit,
    ...pickerAttachments(loaded, catalogueId, unit.id),
    alliedFaction: unit.alliedFaction ? factionDisplayName(unit.alliedFaction, names) : null,
    search: pickerSearchFields(loaded, catalogueId, unit.id, detachments),
  }))
}

/** The lists a faction's reference list and unpriced picker read. */
const constructionLists = {
  cards: { factionCards: true, nonMatchedPlay: true },
  picker: { nonMatchedPlay: true },
} satisfies Record<string, UnitListOptions>

export type ConstructionSummaries = Record<keyof typeof constructionLists, UnitSummary[]>

/** What `pickerConstruction` prices for a book, for a compiled runtime to carry. */
export function constructionSummaries(loaded: LoadedCatalogue, catalogueId: string): ConstructionSummaries {
  const { cards, picker } = constructionLists
  return { cards: unitSummaries(loaded, catalogueId, cards).get(), picker: unitSummaries(loaded, catalogueId, picker).get() }
}

/** Supplies what `constructionSummaries` returned for the same snapshot, so `pickerConstruction` need not price them again. */
export function seedConstructionSummaries(loaded: LoadedCatalogue, catalogueId: string, summaries: ConstructionSummaries) {
  const { cards, picker } = constructionLists
  seedUnitSummaries(loaded, catalogueId, cards, summaries.cards)
  seedUnitSummaries(loaded, catalogueId, picker, summaries.picker)
}

/** Prepares what a faction's unpriced picker and reference list read, a datasheet per step. */
export function* pickerConstruction(loaded: LoadedCatalogue, catalogueId: string): Steps<void> {
  yield* stepThrough(unitSummaries(loaded, catalogueId, constructionLists.cards))
  yield* pickerSteps(loaded, catalogueId)
}

/** Builds everything `pickerUnitsFor` reads for one roster's picker, a datasheet per step. */
export function* pickerSteps(
  loaded: LoadedCatalogue,
  catalogueId: string,
  battleSize?: number,
  waivedRules: readonly string[] = [],
  detachmentIds: readonly string[] = [],
): Steps<void> {
  const units = yield* stepThrough(unitSummaries(loaded, catalogueId, { battleSize, waivedRules, detachmentIds, nonMatchedPlay: true }))
  const detachments = rosterDetachments(loaded, catalogueId, detachmentIds).selections
  for (const unit of units) {
    pickerAttachments(loaded, catalogueId, unit.id)
    pickerSearchFields(loaded, catalogueId, unit.id, detachments)
    yield
  }
}

/** The books whose picker lists a datasheet, which are the rosters a reference page can add it to. */
export function booksOffering(loaded: LoadedCatalogue, entryId: string, catalogueIds: readonly string[]) {
  return catalogueIds.filter((catalogueId) =>
    unitsIn(loaded, catalogueId, '', { nonMatchedPlay: true }).some((unit) => unit.id === entryId),
  )
}
