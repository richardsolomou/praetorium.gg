import { unitsIn } from '../shared/cataloguePicker'
import { describe, expect, it, vi } from 'vitest'
import { bookOf, categories } from './catalogue.fixtures'
import { referenceDatasheetBySlug, referenceFactionDatasheets, referenceRuleIndex, referenceRuleSection } from './referenceCatalogue'

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

  it('lists the core rules first in the rules index', () => {
    const core = { ...ruleDocument, id: 'core-rules', slug: 'core-rules', title: 'Core Rules' }
    const sources = { canonicalCatalogue: () => ({ datasheets: [], ruleDocuments: [ruleDocument, core] }) }

    expect(referenceRuleIndex(sources as never)?.documents[0]?.id).toBe('core-rules')
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

it('lets another request run while preparing a cold faction reference list', async () => {
  const catalogue = bookOf({
    selectionEntries: Array.from({ length: 4 }, (_, index) => ({
      id: `unit-${index}`,
      name: `Unit ${index}`,
      type: 'unit' as const,
      categoryLinks: categories('Faction: Test catalogue'),
    })),
  })
  let settled = false
  const pending = referenceFactionDatasheets(catalogue, { catalogueId: 'cat', query: '' }).then((value) => {
    settled = true
    return value
  })
  const beforeComplete = await new Promise<boolean>((resolve) => setImmediate(() => resolve(settled)))
  await pending
  expect(beforeComplete).toBe(false)
})

it('shares preparation with concurrent and synchronous faction readers', async () => {
  const catalogue = bookOf({
    selectionEntries: Array.from({ length: 4 }, (_, index) => ({
      id: `unit-${index}`,
      name: `Unit ${index}`,
      type: 'unit' as const,
      categoryLinks: categories('Faction: Test catalogue'),
    })),
  })
  const first = referenceFactionDatasheets(catalogue, { catalogueId: 'cat', query: '' })
  const second = referenceFactionDatasheets(catalogue, { catalogueId: 'cat', query: 'Unit 2' })
  const expected = unitsIn(catalogue, 'cat', '', { factionCards: true })
  expect(await Promise.all([first, second])).toEqual([expected, expected.filter((unit) => unit.name === 'Unit 2')])
})

it('retries faction preparation after a source lookup fails', async () => {
  const catalogue = bookOf({
    selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit', categoryLinks: categories('Faction: Test catalogue') }],
  })
  const failure = new Error('source lookup failed')
  const lookup = vi.spyOn(catalogue.index.definitions, 'get').mockImplementationOnce(() => {
    throw failure
  })
  await expect(referenceFactionDatasheets(catalogue, { catalogueId: 'cat', query: '' })).rejects.toBe(failure)
  lookup.mockRestore()
  expect((await referenceFactionDatasheets(catalogue, { catalogueId: 'cat', query: '' })).map((unit) => unit.id)).toEqual(['unit'])
})
