import path from 'node:path'
import { catalogueDirectory, loadCatalogue } from '../src/server/catalogueIndex'
import { compileCanonicalCatalogueFromSnapshot, loadCanonicalCatalogue } from '../src/server/canonicalCatalogue'
import { referenceCorpusFor } from '../src/server/referenceCorpus'
import { evaluateReference } from '../src/server/referenceEvaluation'
import { loadRules } from '../src/server/rules'
import { referenceEvaluationCases } from './referenceEvaluationCases'

const BASELINE = {
  top1DocumentRecall: 0.875,
  top5DocumentRecall: 1,
  anchorRecall: 0.875,
  citationCompleteness: 1,
  maxResponseBytes: 24_000,
  coldLatencyMs: 2_000,
  maxWarmLatencyMs: 250,
}

const directory = catalogueDirectory()
const catalogue = loadCatalogue(directory)
if (!catalogue) throw new Error('reference evaluation requires an installed catalogue snapshot')
const rules = loadRules(
  path.join(directory, 'rules'),
  path.join(directory, 'battlemaster'),
  path.join(directory, 'faction-icons'),
  path.join(directory, 'datacards', '11th', 'gdc'),
  catalogue.datacards,
  catalogue.sourceReferences,
)
const canonical = loadCanonicalCatalogue(directory) ?? compileCanonicalCatalogueFromSnapshot(catalogue, rules, directory)
const corpus = referenceCorpusFor({ canonicalCatalogue: () => canonical, catalogue: () => catalogue, rules: () => rules })
if (!corpus) throw new Error('reference evaluation could not build the active corpus')

const metrics = evaluateReference(corpus, referenceEvaluationCases(corpus))
console.log(JSON.stringify({ revision: corpus.catalogue.revisions, baseline: BASELINE, metrics }, null, 2))

for (const key of ['top1DocumentRecall', 'top5DocumentRecall', 'anchorRecall', 'citationCompleteness'] as const) {
  if (metrics[key] < BASELINE[key]) throw new Error(`${key} ${metrics[key]} is below ${BASELINE[key]}`)
}
for (const key of ['maxResponseBytes', 'coldLatencyMs', 'maxWarmLatencyMs'] as const) {
  if (metrics[key] > BASELINE[key]) throw new Error(`${key} ${metrics[key]} exceeds ${BASELINE[key]}`)
}
