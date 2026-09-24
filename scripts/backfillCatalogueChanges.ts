/**
 * Records what each published snapshot changed, for history the running instance never saw.
 *
 *   pnpm catalogue:backfill [--since 2026-09-01 | --last 10] [--sql changes.sql]
 *
 * Inserts into DATABASE_URL when it is set, writes psql-ready statements with --sql, or both.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type ChangeSource, catalogueChanges, isEmptyChangeSet } from '../src/core/catalogueChanges'
import { openDatabase } from '../src/db/connection'
import { Repository } from '../src/db/repository'
import { referenceCatalogue, snapshotRules } from '../src/server/canonicalCatalogue'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from '../src/server/canonicalCatalogueSources'
import { loadCatalogue } from '../src/server/catalogueIndex'
import {
  catalogueBaseUrl,
  installSnapshotArchive,
  installedSnapshotSources,
  remoteRevocations,
  type SnapshotPointer,
} from '../src/server/catalogueSnapshot'
import { fetchWithRetry } from '../src/server/fetch'
import {
  type ChangeRecord,
  compareInOrder,
  insertStatements,
  type ListedSnapshot,
  parseSnapshotListing,
  snapshotsToCompare,
} from './catalogueBackfill'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const option = (name: string) => {
  const at = args.indexOf(name)
  return at < 0 ? undefined : args[at + 1]
}
const since = option('--since')
const last = option('--last')
const sqlFile = option('--sql')
const databaseUrl = process.env.DATABASE_URL?.trim()
if (!sqlFile && !databaseUrl) throw new Error('set DATABASE_URL, pass --sql <file>, or both')
if (since && Number.isNaN(Date.parse(since))) throw new Error('--since expects a date such as 2026-09-01')
if (last && !/^\d+$/.test(last)) throw new Error('--last expects a number of snapshots')

const base = catalogueBaseUrl()
const started = performance.now()

async function listed() {
  const found: ListedSnapshot[] = []
  let token: string | null = null
  do {
    const url = new URL(base)
    url.searchParams.set('list-type', '2')
    url.searchParams.set('prefix', 'snapshots/')
    if (token) url.searchParams.set('continuation-token', token)
    const response = await fetchWithRetry(url.toString(), { cache: 'no-store' })
    if (!response.ok) throw new Error(`snapshot listing answered ${response.status}`)
    const page = parseSnapshotListing(await response.text())
    found.push(...page.snapshots)
    token = page.next
  } while (token)
  return found
}

const revocations = await remoteRevocations(base)
const snapshots = snapshotsToCompare(await listed(), revocations.snapshots, {
  since: since ? Date.parse(since) : undefined,
  last: last ? Number(last) : undefined,
})
console.log(`comparing ${snapshots.length} snapshots`)

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-backfill-'))
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

const priced = ({ name, points }: { name: string; points: number | null }) => ({ name, points })

/** Only what the diff reads, so the previous snapshot costs little to hold. */
const changeSource = (catalogue: ChangeSource): ChangeSource => ({
  datasheets: catalogue.datasheets.map(({ catalogueId, faction, id, name, points, costs }) => ({
    catalogueId,
    faction,
    id,
    name,
    points,
    costs,
  })),
  detachments: catalogue.detachments.map(({ catalogueId, faction, id, name, points, enhancements, upgrades }) => ({
    catalogueId,
    faction,
    id,
    name,
    points,
    enhancements: enhancements.map(priced),
    upgrades: upgrades.map(priced),
  })),
})

/** One snapshot, downloaded, verified and read the way the instance reads it, then removed. */
async function load(snapshot: ListedSnapshot) {
  const archive = path.join(work, `${snapshot.id}.zip`)
  const directory = path.join(work, snapshot.id)
  try {
    const response = await fetchWithRetry(`${base}/snapshots/${snapshot.id}.zip`)
    if (!response.ok) throw new Error(`snapshot answered ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    fs.writeFileSync(archive, bytes)
    // The listing carries no archive checksum; the id is the manifest's hash and the
    // manifest hashes every file, so those still verify what is inside.
    const pointer: SnapshotPointer = { format: 'praetorium.catalogue-pointer.v1', id: snapshot.id, archiveSha256: sha256(bytes) }
    installSnapshotArchive(directory, archive, pointer, null)
    fs.rmSync(archive, { force: true })
    const sources = installedSnapshotSources(directory)
    if (!sources) throw new Error('today’s code does not read it as a complete snapshot, such as a source it no longer knows')
    const missing = CANONICAL_CATALOGUE_SOURCE_NAMES.filter((name) => !sources.includes(name))
    // A reference catalogue compiled without one of its sources would read as everything it lacks being removed.
    if (missing.length) throw new Error(`snapshot carries no ${missing.join(', ')}`)
    const catalogue = loadCatalogue(directory)
    const reference = referenceCatalogue(
      directory,
      () => catalogue,
      () => (catalogue ? snapshotRules(directory, catalogue) : null),
    )
    return reference ? changeSource(reference) : null
  } finally {
    fs.rmSync(archive, { force: true })
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

const records: ChangeRecord[] = []
const connection = databaseUrl ? openDatabase(databaseUrl) : null
const repository = connection ? new Repository(connection.database) : null
let stored = 0
try {
  const { skipped } = await compareInOrder(snapshots, load, async (older, newer) => {
    const changes = catalogueChanges(older.value, newer.value)
    const when = new Date(newer.snapshot.publishedAt).toISOString()
    if (isEmptyChangeSet(changes)) {
      console.log(`${when} ${newer.snapshot.id.slice(0, 10)}: no changes`)
      return
    }
    const record = { fromSnapshot: older.snapshot.id, toSnapshot: newer.snapshot.id, recordedAt: newer.snapshot.publishedAt, changes }
    records.push(record)
    const count = changes.factions.reduce((total, faction) => total + faction.changes.length, 0) + changes.omitted
    if (repository && (await repository.recordCatalogueChanges(record))) stored++
    console.log(`${when} ${newer.snapshot.id.slice(0, 10)}: ${count} changes`)
  })
  for (const { snapshot, reason } of skipped) {
    console.log(`skipped ${snapshot.id} (${new Date(snapshot.publishedAt).toISOString()}): ${reason}`)
  }
  if (sqlFile) fs.writeFileSync(sqlFile, insertStatements(records))
  console.log(
    `${records.length} change sets from ${snapshots.length} snapshots, ${skipped.length} skipped` +
      (repository ? `, ${stored} newly stored` : '') +
      (sqlFile ? `, ${sqlFile} ${fs.statSync(sqlFile).size} bytes` : '') +
      `, ${Math.round((performance.now() - started) / 1000)}s`,
  )
} finally {
  fs.rmSync(work, { recursive: true, force: true })
  await connection?.close()
}
