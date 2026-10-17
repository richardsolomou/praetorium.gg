import { parseArgs } from 'node:util'
import { compareCatalogueCoverage, readAcceptedLosses } from './lib/catalogueCoverageComparison'

const {
  positionals: [before, after],
  values,
} = parseArgs({ allowPositionals: true, options: { accept: { type: 'string' } } })
if (!before || !after) throw new Error('usage: compareCatalogueCoverage.ts <before.json> <after.json> [--accept <withdrawn.json>]')

compareCatalogueCoverage(before, after, readAcceptedLosses(values.accept))
