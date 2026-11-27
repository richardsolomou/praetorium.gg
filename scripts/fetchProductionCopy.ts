import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { downloadProductionCopy } from './productionCopy'

/** The product tables that hold players' lists and units: saved rosters, battle commands (lists fielded into a battle), sealed entries and saved unit loadouts. */
const KEPT = new Set(['rosters', 'commands', 'sealedEventEntries', 'unitLoadouts'])

/**
 * Keeps a private copy of every list players hold, gzipped, for local reports such as `scripts/vsDataParity.ts`. The
 * production copy also carries accounts and every other table, so it is read once and deleted, whatever happens.
 */
const file = path.resolve(process.argv[2] ?? 'data-dev/production-lists.ndjson.gz')
const full = `${file}.download`
await mkdir(path.dirname(file), { recursive: true })
try {
  await downloadProductionCopy(
    process.env.PRODUCTION_SSH_HOST ?? 'hera',
    process.env.PRODUCTION_WEB_SERVICE ?? 'praetoriumgg-web-ecmusg',
    full,
  )
  const lines = createInterface({ input: createReadStream(full).pipe(createGunzip()), crlfDelay: Infinity })
  async function* kept() {
    for await (const line of lines) {
      const entry = line ? (JSON.parse(line) as { product?: string; end?: string }) : {}
      // The last record names when the backup was taken, which anything frozen from the copy is dated by.
      if ((entry.product && KEPT.has(entry.product)) || entry.end) yield `${line}\n`
    }
  }
  await pipeline(kept, createGzip(), createWriteStream(file, { mode: 0o600 }))
  console.log(file)
} finally {
  await rm(full, { force: true })
}
