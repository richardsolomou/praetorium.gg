import fs from 'node:fs'
import { compareCatalogueCoverage } from './catalogueCoverageComparison'

const [before, after] = process.argv.slice(2)
if (!before || !after) throw new Error('usage: compareCatalogueCoverage.ts <before.json> <after.json> [--accept <withdrawn.json>]')
const acceptAt = process.argv[process.argv.indexOf('--accept') + 1]
const accepted: { reason: string; entries: string[] }[] =
  process.argv.includes('--accept') && acceptAt ? JSON.parse(fs.readFileSync(acceptAt, 'utf8')) : []

compareCatalogueCoverage(before, after, accepted)
