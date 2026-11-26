import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { downloadProductionCopy } from './productionCopy'

/** Keeps a private copy of every product table, gzipped, for local reports such as `scripts/vsDataParity.ts`. */
const file = path.resolve(process.argv[2] ?? 'data-dev/production-copy.ndjson.gz')
await mkdir(path.dirname(file), { recursive: true })
await downloadProductionCopy(
  process.env.PRODUCTION_SSH_HOST ?? 'hera',
  process.env.PRODUCTION_WEB_SERVICE ?? 'praetoriumgg-web-ecmusg',
  file,
)
console.log(file)
