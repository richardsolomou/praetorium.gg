import { expect, it } from 'vitest'
import type { CanonicalCatalogue } from '../contracts/catalogue'
import type { ReferenceDocument } from '../contracts/reference'
import type { ReferenceCorpus } from './referenceCorpus'
import { evaluateReference } from './referenceEvaluation'

const document: ReferenceDocument = {
  id: 'rule:core:move',
  kind: 'rule',
  title: 'Move Units',
  faction: null,
  url: '/rules/core/movement#move',
  sections: [{ id: 'move', title: 'Move Units', text: 'Move across the battlefield.', url: '/rules/core/movement#move' }],
  revisions: { datacards: 'revision' },
  attribution: ['Community data'],
}
const catalogue: CanonicalCatalogue = {
  format: 'praetorium.canonical-catalogue.v1',
  compilerVersion: 1,
  revisions: { datacards: 'revision' },
  datasheets: [],
  detachments: [],
  ruleDocuments: [],
  issues: [],
}
const corpus: ReferenceCorpus = {
  catalogue,
  documents: [document],
  byId: new Map([[document.id, document]]),
  revision: 'snapshot',
}

it('measures document, anchor, citation, response, and latency baselines', () => {
  const times = [0, 4]
  const metrics = evaluateReference(
    corpus,
    [{ name: 'movement', query: 'move units', expectedDocumentId: document.id, expectedSectionId: 'move' }],
    () => times.shift()!,
  )

  expect(metrics).toMatchObject({
    cases: 1,
    top1DocumentRecall: 1,
    top5DocumentRecall: 1,
    anchorRecall: 1,
    citationCompleteness: 1,
    coldLatencyMs: 4,
    failures: [],
  })
})

it('reports an independently wrong expected document', () => {
  const metrics = evaluateReference(
    corpus,
    [{ name: 'wrong', query: 'move units', expectedDocumentId: 'rule:core:wrong', expectedSectionId: 'wrong' }],
    () => 0,
  )

  expect(metrics.failures).toEqual([{ name: 'wrong', top1: false, top5: false, anchor: false, citation: false }])
})
