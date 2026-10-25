import { completeStepsCooperatively } from './canonicalCatalogue'
import { stepThrough } from '../shared/steps'
import { unitSummaries, unitsIn } from '../shared/cataloguePicker'
import { isReferenceDatasheet } from '../shared/catalogueIndex'
import { coreRulesFirst } from './rulesCore'
import type { CanonicalCatalogue, FactionDatasheet } from '../contracts/catalogue'
import { datasheetInBySlug, datasheetSearchFieldsIn } from '../shared/catalogue'
import { datasheetPageBySlug } from '../core/datasheetSlug'
import type { LoadedCatalogue } from './catalogueIndex'
import { describeDatasheetAbilities } from '../shared/datasheetDescriptions'
import { detachmentReference } from '../shared/detachmentReference'
import { withDefinitionTokens } from './sourceTexts'
import type { LoadedRules } from './rules'
import { ruleIndexOf, ruleSectionOf } from './rulesCore'

/** A faction as the browser gets it: BSData's words in its army rules published as tokens, like every page. */
export const publishedFaction = <T>(faction: T, catalogue: LoadedCatalogue | null) =>
  withDefinitionTokens(faction, catalogue?.definitionTexts)

/** A detachment's reference page data, with BSData's words published as tokens; rules that compute from it read `detachmentReference`. */
export const publishedDetachmentReference = (catalogue: LoadedCatalogue, rules: LoadedRules, catalogueId: string, slug: string) =>
  withDefinitionTokens(detachmentReference(catalogue, rules, catalogueId, slug), catalogue.definitionTexts)

type ReferenceSources = {
  canonicalCatalogue: () => CanonicalCatalogue | null
  catalogue: () => LoadedCatalogue | null
  rules: () => LoadedRules | null
}

export function referenceDatasheetBySlug(sources: ReferenceSources, data: { catalogueId: string; slug: string }) {
  const canonical = sources.canonicalCatalogue()
  if (canonical) {
    return datasheetPageBySlug(
      canonical.datasheets.filter((sheet) => sheet.catalogueId === data.catalogueId),
      data.slug,
    )
  }
  const loaded = sources.catalogue()
  return loaded
    ? describeDatasheetAbilities(loaded, data.catalogueId, datasheetInBySlug(loaded, data.catalogueId, data.slug), sources.rules(), {
        reference: true,
      })
    : null
}

function referenceRuleDocuments(sources: ReferenceSources) {
  const canonical = sources.canonicalCatalogue()
  if (canonical) return coreRulesFirst(canonical.ruleDocuments)
  return sources.rules()?.ruleDocuments ?? null
}

export function referenceRuleIndex(sources: ReferenceSources) {
  const documents = referenceRuleDocuments(sources)
  return documents ? ruleIndexOf(documents) : null
}

export function referenceRuleSection(sources: ReferenceSources, data: { documentId: string; sectionId: string }) {
  const documents = referenceRuleDocuments(sources)
  return documents ? ruleSectionOf(documents, data.documentId, data.sectionId) : null
}

export async function referenceFactionDatasheets(catalogue: LoadedCatalogue, data: { catalogueId: string; query: string }) {
  const options = { factionCards: true, nonMatchedPlay: true }
  await completeStepsCooperatively(stepThrough(unitSummaries(catalogue, data.catalogueId, options)))
  return unitsIn(catalogue, data.catalogueId, data.query, options).flatMap((unit): FactionDatasheet[] =>
    isReferenceDatasheet(catalogue, data.catalogueId, unit.id)
      ? [{ ...unit, keywords: datasheetSearchFieldsIn(catalogue, data.catalogueId, unit.id)?.keywords ?? [] }]
      : [],
  )
}
