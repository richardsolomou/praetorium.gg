import type { ReferenceKind } from '../src/contracts/reference'
import type { ReferenceCorpus } from '../src/server/referenceCorpus'
import type { ReferenceEvaluationCase } from '../src/server/referenceEvaluation'

type QuerySource =
  | { kind: 'document-id' }
  | { kind: 'section-id' }
  | { kind: 'section-title' }
  | { kind: 'section-text'; start: number; words: number }
  | { kind: 'document-title-and-section-text'; start: number; words: number }
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
  {
    name: 'ambiguous ability stays inside its faction',
    expectedDocumentId: 'datasheet:grey-knights:strike-squad',
    expectedSectionId: 'ability-2f18-cd5-2ec-a1d2',
    query: { kind: 'section-title' },
    kinds: ['datasheet'],
    faction: 'Grey Knights',
  },
  {
    name: 'missing description remains explicit',
    expectedDocumentId: 'datasheet:genestealer-cults:achilles-ridgerunners',
    expectedSectionId: 'ability-granted:c727-a3d8-fceb-6ebd',
    query: { kind: 'section-id' },
    kinds: ['datasheet'],
    faction: 'Genestealer Cults',
  },
  {
    name: 'conflicting source field uses the declared winner',
    expectedDocumentId: 'datasheet:chaos-daemons:pink-horrors',
    expectedSectionId: 'points',
    query: { kind: 'document-title-and-section-text', start: 2, words: 2 },
    kinds: ['datasheet'],
    faction: 'Chaos Daemons',
  },
]

export function referenceEvaluationCases(corpus: ReferenceCorpus): ReferenceEvaluationCase[] {
  validateSourceCases(corpus)
  return referenceEvaluationFixtures.map((fixture) => {
    const document = corpus.byId.get(fixture.expectedDocumentId)
    const section = document?.sections.find((candidate) => candidate.id === fixture.expectedSectionId)
    if (!document || !section) throw new Error(`reference evaluation fixture ${fixture.name} is absent from the active snapshot`)
    return {
      name: fixture.name,
      expectedDocumentId: fixture.expectedDocumentId,
      expectedSectionId: fixture.expectedSectionId,
      query: queryFrom(fixture.query, document.id, document.title, section.id, section.title, section.text),
      kinds: fixture.kinds,
      faction: fixture.faction,
    }
  })
}

function queryFrom(
  source: QuerySource,
  documentId: string,
  documentTitle: string,
  sectionId: string,
  sectionTitle: string,
  sectionText: string,
) {
  if (source.kind === 'document-id') return documentId
  if (source.kind === 'section-id') return sectionId
  if (source.kind === 'section-title') return sectionTitle
  if (source.kind === 'section-title-plural') return `${sectionTitle}s`
  if (source.kind === 'section-title-typo') return `${sectionTitle.slice(0, source.remove)}${sectionTitle.slice(source.remove + 1)}`
  const words = sectionText.normalize('NFKD').match(/[\p{L}\p{N}]+/gu) ?? []
  const excerpt = words.slice(source.start, source.start + source.words).join(' ')
  const query = source.kind === 'document-title-and-section-text' ? `${documentTitle} ${excerpt}` : excerpt
  if (!query) throw new Error(`reference evaluation query is empty for ${documentId}:${sectionId}`)
  return query
}

function validateSourceCases(corpus: ReferenceCorpus) {
  if (!corpus.documents.some((document) => document.sections.some((section) => section.text.includes('Description unavailable.')))) {
    throw new Error('reference evaluation requires an explicit missing description')
  }
  if (
    !corpus.catalogue.datasheets.some((sheet) => Object.values(sheet.provenance.fields).some((field) => field.strategy === 'unresolved'))
  ) {
    throw new Error('reference evaluation requires an unresolved source field')
  }
  if (!corpus.catalogue.issues.some((issue) => issue.kind === 'source-field-conflict')) {
    throw new Error('reference evaluation requires a conflicting source field')
  }
}
