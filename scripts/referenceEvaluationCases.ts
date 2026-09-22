import type { ReferenceKind } from '../src/contracts/reference'
import type { ReferenceCorpus } from '../src/server/referenceCorpus'
import type { ReferenceEvaluationCase } from '../src/server/referenceEvaluation'

type QuerySource =
  | { kind: 'document-id' }
  | { kind: 'section-id' }
  | { kind: 'section-text'; start: number; words: number }
  | { kind: 'section-title-plural' }
  | { kind: 'section-title-typo'; remove: number }

type Fixture = {
  name: string
  expectedDocumentId: string
  expectedSectionId: string
  query: QuerySource
  kinds?: ReferenceKind[]
  faction?: string
}

export const referenceEvaluationFixtures: readonly Fixture[] = [
  {
    name: 'stable rule id',
    expectedDocumentId: 'rule:core-rules:09.00',
    expectedSectionId: '09.00',
    query: { kind: 'document-id' },
  },
  {
    name: 'printed rule number',
    expectedDocumentId: 'rule:core-rules:09.00',
    expectedSectionId: '09.00',
    query: { kind: 'section-id' },
  },
  {
    name: 'rule prose',
    expectedDocumentId: 'rule:core-rules:09.00',
    expectedSectionId: '09.00',
    query: { kind: 'section-text', start: 19, words: 11 },
  },
  {
    name: 'misspelled rule title',
    expectedDocumentId: 'rule:core-rules:09.00',
    expectedSectionId: '09.00',
    query: { kind: 'section-title-typo', remove: 3 },
  },
  {
    name: 'datasheet ability prose',
    expectedDocumentId: 'datasheet:adepta-sororitas:battle-sisters-squad',
    expectedSectionId: 'ability-f4b9-855b-cce7-f501',
    query: { kind: 'section-text', start: 15, words: 4 },
    kinds: ['datasheet'],
    faction: 'Adepta Sororitas',
  },
  {
    name: 'plural weapon name',
    expectedDocumentId: 'datasheet:adepta-sororitas:battle-sisters-squad',
    expectedSectionId: 'profile-df04-84ff-f841-7e9c',
    query: { kind: 'section-title-plural' },
    kinds: ['datasheet'],
    faction: 'Adepta Sororitas',
  },
  {
    name: 'referenced keyword prose',
    expectedDocumentId: 'datasheet:adepta-sororitas:battle-sisters-squad',
    expectedSectionId: 'keyword-rules',
    query: { kind: 'section-text', start: 316, words: 10 },
    kinds: ['datasheet'],
    faction: 'Adepta Sororitas',
  },
  {
    name: 'enhancement prose',
    expectedDocumentId: 'detachment:adepta-sororitas:bringers-of-flame',
    expectedSectionId: 'enhancement-fire-and-fury',
    query: { kind: 'section-text', start: 13, words: 9 },
    kinds: ['detachment'],
    faction: 'Adepta Sororitas',
  },
  {
    name: 'stratagem prose',
    expectedDocumentId: 'detachment:adepta-sororitas:bringers-of-flame',
    expectedSectionId: 'stratagem-carry-forth-the-faithful',
    query: { kind: 'section-text', start: 46, words: 10 },
    kinds: ['detachment'],
    faction: 'Adepta Sororitas',
  },
]

export function referenceEvaluationCases(corpus: ReferenceCorpus): ReferenceEvaluationCase[] {
  return referenceEvaluationFixtures.map((fixture) => {
    const document = corpus.byId.get(fixture.expectedDocumentId)
    const section = document?.sections.find((candidate) => candidate.id === fixture.expectedSectionId)
    if (!document || !section) throw new Error(`reference evaluation fixture ${fixture.name} is absent from the active snapshot`)
    return {
      name: fixture.name,
      expectedDocumentId: fixture.expectedDocumentId,
      expectedSectionId: fixture.expectedSectionId,
      query: queryFrom(fixture.query, document.id, section.id, section.title, section.text),
      kinds: fixture.kinds,
      faction: fixture.faction,
    }
  })
}

function queryFrom(source: QuerySource, documentId: string, sectionId: string, sectionTitle: string, sectionText: string) {
  if (source.kind === 'document-id') return documentId
  if (source.kind === 'section-id') return sectionId
  if (source.kind === 'section-title-plural') return `${sectionTitle}s`
  if (source.kind === 'section-title-typo') return `${sectionTitle.slice(0, source.remove)}${sectionTitle.slice(source.remove + 1)}`
  const words = sectionText.normalize('NFKD').match(/[\p{L}\p{N}]+/gu) ?? []
  const query = words.slice(source.start, source.start + source.words).join(' ')
  if (!query) throw new Error(`reference evaluation query is empty for ${documentId}:${sectionId}`)
  return query
}
