import { expect, it } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import { referenceCorpusFor } from './referenceCorpus'

function canonical(revision: string, text: string): CanonicalCatalogue {
  return {
    format: 'praetorium.canonical-catalogue.v1',
    compilerVersion: 1,
    revisions: { datacards: revision },
    datasheets: [],
    detachments: [],
    ruleDocuments: [
      {
        id: 'core',
        slug: 'core',
        title: 'Core Rules',
        updated: null,
        sections: [
          {
            id: 'movement',
            slug: 'movement',
            title: 'Movement',
            entries: [
              {
                id: 'move',
                code: '1.1',
                anchor: '1.1',
                title: 'Move',
                blocks: [{ kind: 'prose', markup: text }],
                facts: [],
                cost: null,
                lore: null,
              },
            ],
          },
        ],
        provenance: { datacards: { revision } },
      },
    ],
    issues: [],
  }
}

it('rebuilds the corpus when the active snapshot is replaced', () => {
  let active = canonical('one', 'First snapshot.')
  const sources = { canonicalCatalogue: () => active, catalogue: () => null, rules: () => null }
  const before = referenceCorpusFor(sources)!
  active = canonical('two', 'Replacement snapshot.')
  const after = referenceCorpusFor(sources)!

  expect({ changed: after.revision !== before.revision, text: after.documents[0]?.sections[0]?.text }).toEqual({
    changed: true,
    text: '1.1\nReplacement snapshot.',
  })
})

it('changes the corpus identity when projected content changes at the same source revisions', () => {
  const before = canonical('one', 'First projection.')
  const after = canonical('one', 'Replacement projection.')

  expect(referenceCorpusFor({ canonicalCatalogue: () => after, catalogue: () => null, rules: () => null })!.revision).not.toBe(
    referenceCorpusFor({ canonicalCatalogue: () => before, catalogue: () => null, rules: () => null })!.revision,
  )
})

it('includes rule costs and lore in searchable and retrievable text', () => {
  const source = canonical('one', 'Rule text.')
  const entry = source.ruleDocuments[0]!.sections[0]!.entries[0]!
  entry.cost = 2
  entry.lore = 'A remembered victory guides the commander.'

  const document = referenceCorpusFor({ canonicalCatalogue: () => source, catalogue: () => null, rules: () => null })!.documents[0]!

  expect(document.sections[0]?.text).toContain('2 CP\nA remembered victory guides the commander.')
})

it('does not construct a reference without an active canonical snapshot', () => {
  expect(referenceCorpusFor({ canonicalCatalogue: () => null, catalogue: () => null, rules: () => null })).toBeNull()
})

it('stops serving a previously active snapshot when it is revoked', () => {
  let active: CanonicalCatalogue | null = canonical('one', 'First snapshot.')
  const sources = { canonicalCatalogue: () => active, catalogue: () => null, rules: () => null }

  expect(referenceCorpusFor(sources)).not.toBeNull()
  active = null
  expect(referenceCorpusFor(sources)).toBeNull()
})

it('keeps missing source descriptions explicit in bounded documents', () => {
  const source = canonical('one', 'Rule text.')
  source.detachments.push({
    catalogueId: 'test',
    faction: 'Test Faction',
    factionSlug: 'test',
    id: 'detachment',
    slug: 'detachment',
    name: 'Detachment',
    points: null,
    dispositions: [],
    rules: [{ name: 'Unknown Rule', description: null }],
    enhancements: [{ name: 'Unknown Enhancement', points: null, description: null }],
    upgrades: [],
    stratagems: [],
    keywordRules: [],
    attribution: 'Community data',
    provenance: {
      definitions: { revision: 'one', detachmentId: 'detachment' },
      rules: { revision: 'one' },
      datacards: { revision: 'one' },
    },
  })

  const document = referenceCorpusFor({ canonicalCatalogue: () => source, catalogue: () => null, rules: () => null })!.byId.get(
    'detachment:test:detachment',
  )!

  expect(document.sections.filter((entry) => entry.text === 'Description unavailable.').map((entry) => entry.id)).toEqual([
    'rule-unknown-rule',
    'enhancement-unknown-enhancement',
  ])
})
