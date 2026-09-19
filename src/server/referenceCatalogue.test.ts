import { describe, expect, it, vi } from 'vitest'
import { bookOf, categories } from './catalogue.fixtures'
import { referenceDatasheetBySlug, referenceRuleIndex, referenceRuleSection } from './referenceCatalogue'

const ruleDocument = {
  id: 'canonical-document',
  slug: 'canonical-document',
  title: 'Canonical document',
  updated: null,
  sections: [
    {
      id: 'canonical-section',
      slug: 'canonical-section',
      title: 'Canonical section',
      entries: [],
    },
  ],
  provenance: { datacards: { revision: 'canonical-revision' } },
}

function referenceSources() {
  const sheet = { catalogueId: 'canonical-catalogue', slug: 'canonical-sheet', name: 'Canonical sheet' }
  return {
    sheet,
    sources: {
      canonicalCatalogue: () => ({ datasheets: [sheet], ruleDocuments: [ruleDocument] }),
      catalogue: vi.fn(() => {
        throw new Error('source catalogue should not be read')
      }),
      rules: vi.fn(() => {
        throw new Error('source rules should not be read')
      }),
    },
  }
}

describe('canonical reference boundaries', () => {
  it('serves a datasheet from the canonical catalogue', () => {
    const { sources, sheet } = referenceSources()

    expect(referenceDatasheetBySlug(sources as never, { catalogueId: 'canonical-catalogue', slug: 'canonical-sheet' })).toBe(sheet)
  })

  it('does not fall back when a canonical catalogue lacks a datasheet', () => {
    const { sources } = referenceSources()

    expect(referenceDatasheetBySlug(sources as never, { catalogueId: 'canonical-catalogue', slug: 'missing' })).toBeNull()
  })

  it('builds the rules index from canonical documents', () => {
    const { sources } = referenceSources()

    expect(referenceRuleIndex(sources as never)?.documents).toContainEqual(
      expect.objectContaining({ id: 'canonical-document', title: 'Canonical document' }),
    )
  })

  it('reads a rule section from canonical documents', () => {
    const { sources } = referenceSources()

    expect(
      referenceRuleSection(sources as never, { documentId: 'canonical-document', sectionId: 'canonical-section' })?.section.title,
    ).toBe('Canonical section')
  })

  it('falls back to source data for a snapshot without a canonical catalogue', () => {
    const catalogue = bookOf({
      selectionEntries: [
        {
          id: 'legacy-sheet',
          name: 'Legacy sheet',
          type: 'unit',
          categoryLinks: categories('Faction: Test catalogue'),
        },
      ],
    })
    const datasheetSources = { canonicalCatalogue: () => null, catalogue: () => catalogue, rules: () => null }
    const ruleSources = {
      canonicalCatalogue: () => null,
      catalogue: () => null,
      rules: () => ({ ruleDocuments: [ruleDocument] }),
    }

    expect(referenceDatasheetBySlug(datasheetSources, { catalogueId: 'cat', slug: 'legacy-sheet' })?.name).toBe('Legacy sheet')
    expect(referenceRuleIndex(ruleSources as never)?.documents).toContainEqual(
      expect.objectContaining({ id: 'canonical-document', title: 'Canonical document' }),
    )
    expect(
      referenceRuleSection(ruleSources as never, { documentId: 'canonical-document', sectionId: 'canonical-section' })?.section.title,
    ).toBe('Canonical section')
  })
})
