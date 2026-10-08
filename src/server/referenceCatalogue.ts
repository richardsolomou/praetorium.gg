import type { CanonicalCatalogue } from '../contracts/catalogue'
import { datasheetInBySlug } from './catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { describeDatasheetAbilities } from './datasheetDescriptions'
import type { LoadedRules } from './rules'
import { ruleIndexOf, ruleSectionOf } from './rulesCore'

type ReferenceSources = {
  canonicalCatalogue: () => CanonicalCatalogue | null
  catalogue: () => LoadedCatalogue | null
  rules: () => LoadedRules | null
}

export function referenceDatasheetBySlug(sources: ReferenceSources, data: { catalogueId: string; slug: string }) {
  const canonical = sources.canonicalCatalogue()
  if (canonical) {
    return canonical.datasheets.find((sheet) => sheet.catalogueId === data.catalogueId && sheet.slug === data.slug) ?? null
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
  if (canonical) return canonical.ruleDocuments
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
