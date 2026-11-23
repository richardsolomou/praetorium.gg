import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { completeSteps } from '../src/shared/steps'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { baselineShortfall } from './lib/baselines'
import { catalogueDataDirectory } from './lib/catalogueFiles'

/**
 * How many Game Datacards records of the summarized rules version show a VS Data summary, by kind. A ratchet:
 * a count may not fall below `catalogue/vs-data-coverage.json`. Add `--write` to raise it, `--details` to list misses.
 */
const baselineFile = path.resolve(import.meta.dirname, '..', 'catalogue', 'vs-data-coverage.json')
const baseline = z.record(z.string(), z.number().int()).parse(JSON.parse(fs.readFileSync(baselineFile, 'utf8')))

const summaries = completeSteps(vsDataSummariesSteps(catalogueDataDirectory(), []))
if (!summaries) {
  baselineShortfall('the snapshot has no VS Data summaries for any of its rules versions')
} else {
  const joins = summaries.joins()
  const kinds = [...new Set(joins.map((join) => join.kind))]
  const served: Record<string, number> = {}
  console.log(`VS Data summaries for ${summaries.edition}`)
  for (const kind of kinds) {
    const ofKind = joins.filter((join) => join.kind === kind)
    served[kind] = ofKind.filter((join) => join.served).length
    const named = ofKind.filter((join) => join.named).length
    console.log(`  ${kind}: ${served[kind]} of ${ofKind.length} served, ${named} named by VS Data`)
  }
  console.log(`withheld for repeating a source's wording: ${summaries.withheld.length}`)
  if (process.argv.includes('--details')) {
    for (const id of summaries.withheld) console.log(`  withheld | ${id}`)
    for (const join of joins.filter((candidate) => !candidate.served))
      console.log(`  ${join.named ? 'no summary' : 'unnamed   '} | ${join.key}`)
  }
  if (process.argv.includes('--write')) fs.writeFileSync(baselineFile, `${JSON.stringify(served, null, 2)}\n`)
  for (const [kind, count] of Object.entries(baseline))
    if ((served[kind] ?? 0) < count) baselineShortfall(`VS Data ${kind} summaries fell from ${count} to ${served[kind] ?? 0}`)
}
