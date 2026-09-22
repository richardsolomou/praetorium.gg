import type { ReferenceSearchInput } from './referenceSearch'
import { searchReference } from './referenceSearch'
import type { ReferenceCorpus } from './referenceCorpus'

export type ReferenceEvaluationCase = ReferenceSearchInput & {
  name: string
  expectedDocumentId: string
  expectedSectionId: string
}

export type ReferenceEvaluationMetrics = {
  cases: number
  top1DocumentRecall: number
  top5DocumentRecall: number
  anchorRecall: number
  citationCompleteness: number
  maxResponseBytes: number
  coldLatencyMs: number
  maxWarmLatencyMs: number
  failures: { name: string; top1: boolean; top5: boolean; anchor: boolean; citation: boolean }[]
}

export function evaluateReference(
  corpus: ReferenceCorpus,
  cases: readonly ReferenceEvaluationCase[],
  clock: () => number = () => performance.now(),
): ReferenceEvaluationMetrics {
  const encoder = new TextEncoder()
  let top1 = 0
  let top5 = 0
  let anchors = 0
  let citations = 0
  let maxResponseBytes = 0
  let coldLatencyMs = 0
  let maxWarmLatencyMs = 0
  const failures: ReferenceEvaluationMetrics['failures'] = []

  cases.forEach(({ name, expectedDocumentId, expectedSectionId, ...input }, index) => {
    const started = clock()
    const response = searchReference(corpus, { ...input, limit: 5 })
    const latency = clock() - started
    if (index === 0) coldLatencyMs = latency
    else maxWarmLatencyMs = Math.max(maxWarmLatencyMs, latency)
    maxResponseBytes = Math.max(maxResponseBytes, encoder.encode(JSON.stringify(response)).byteLength)
    const first = response.results[0]
    const expected = response.results.find((result) => result.id === expectedDocumentId)
    const top1Found = first?.id === expectedDocumentId
    const top5Found = Boolean(expected)
    const anchorFound = expected?.section.id === expectedSectionId
    const citationFound = Boolean(
      expected?.url.startsWith('/') &&
      expected.section.url.startsWith('/') &&
      expected.section.url.includes('#') &&
      Object.keys(expected.revisions).length &&
      expected.attribution.length,
    )
    top1 += Number(top1Found)
    top5 += Number(top5Found)
    anchors += Number(anchorFound)
    citations += Number(citationFound)
    if (!top1Found || !top5Found || !anchorFound || !citationFound) {
      failures.push({ name, top1: top1Found, top5: top5Found, anchor: anchorFound, citation: citationFound })
    }
  })

  const total = cases.length || 1
  return {
    cases: cases.length,
    top1DocumentRecall: top1 / total,
    top5DocumentRecall: top5 / total,
    anchorRecall: anchors / total,
    citationCompleteness: citations / total,
    maxResponseBytes,
    coldLatencyMs,
    maxWarmLatencyMs,
    failures,
  }
}
