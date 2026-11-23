import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { completeSteps } from '../src/shared/steps'
import { vsDataSummariesSteps } from '../src/server/vsDataSummaries'
import { baselineShortfall } from './lib/baselines'
import { catalogueDataDirectory } from './lib/catalogueFiles'

/**
 * How many Game Datacards records of each summarized rules version show a VS Data summary, by kind. A ratchet: a count
 * may not fall below `catalogue/vs-data-coverage.json`. Add `--write` to raise it, `--details` to list misses.
 */
const baselineFile = path.resolve(import.meta.dirname, '..', 'catalogue', 'vs-data-coverage.json')
const counts = z.record(z.string(), z.record(z.string(), z.number().int()))
const baseline = counts.parse(JSON.parse(fs.readFileSync(baselineFile, 'utf8')))

const summaries = completeSteps(vsDataSummariesSteps(catalogueDataDirectory(), []))
if (!summaries) {
  baselineShortfall('the snapshot has no VS Data summaries for any of its rules versions')
} else {
  const served: Record<string, Record<string, number>> = {}
  for (const edition of summaries.editions) {
    const joins = summaries.joins(edition)
    const ofEdition: Record<string, number> = (served[edition] = {})
    console.log(`VS Data summaries for ${edition}`)
    for (const kind of new Set(joins.map((join) => join.kind))) {
      const ofKind = joins.filter((join) => join.kind === kind)
      ofEdition[kind] = ofKind.filter((join) => join.served).length
      const named = ofKind.filter((join) => join.named).length
      console.log(`  ${kind}: ${ofEdition[kind]} of ${ofKind.length} served, ${named} named by VS Data`)
    }
    if (process.argv.includes('--details'))
      for (const join of joins.filter((candidate) => !candidate.served))
        console.log(`  ${join.named ? 'no summary' : 'unnamed   '} | ${join.key}`)
  }
  console.log(`withheld for repeating a source's wording: ${summaries.withheld.length}`)
  if (process.argv.includes('--details')) for (const id of summaries.withheld) console.log(`  withheld | ${id}`)
  if (process.argv.includes('--write')) fs.writeFileSync(baselineFile, `${JSON.stringify(served, null, 2)}\n`)
  for (const [edition, kinds] of Object.entries(baseline))
    for (const [kind, count] of Object.entries(kinds)) {
      const now = served[edition]?.[kind] ?? 0
      if (now < count) baselineShortfall(`VS Data ${edition} ${kind} summaries fell from ${count} to ${now}`)
    }
}
