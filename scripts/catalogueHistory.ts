/**
 * Carries the data-update history into the snapshot about to be packed.
 *
 *   pnpm catalogue:history
 *
 * Run by the publisher after the sources are synced into `catalogue-data` and before
 * `pnpm catalogue:snapshot pack`. Normal updates carry forward unreadable history; an
 * explicit `--repair-last` fails if it cannot verify both snapshots it compares.
 */

import fs from 'node:fs'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { CATALOGUE_HISTORY_FORMAT } from '../src/core/catalogueHistory'
import { CATALOGUE_HISTORY_FILE, loadCatalogueHistory, parseCatalogueHistory } from '../src/server/catalogueHistory'
import {
  catalogueBaseUrl,
  fetchCurrentPointer,
  fetchSnapshot,
  historicalSnapshotSources,
  installSnapshotArchive,
  MAX_ARCHIVE_BYTES,
  remoteRevocations,
} from '../src/server/catalogueSnapshot'
import { isSnapshotSourceName } from '../src/server/catalogueSources'
import { fetchWithRetry } from '../src/server/fetch'
import { catalogueChanges } from '../src/core/catalogueChanges'
import { compiledChangeSource } from './lib/catalogueHistoryCompile'
import { type HistoryPoint, nextHistory } from './lib/catalogueHistoryPlan'

const root = path.join(import.meta.dirname, '..')
const directory = process.env.CATALOGUE_DIR ?? path.join(root, 'catalogue-data')
const base = catalogueBaseUrl()
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-history-'))
const repairLast = process.argv.includes('--repair-last')

const attempt = <T>(label: string, run: () => T) => {
  try {
    return run()
  } catch (error) {
    console.log(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

const revisionsIn = (catalogue: string): Record<string, string> =>
  Object.fromEntries(
    Object.entries(JSON.parse(fs.readFileSync(path.join(catalogue, 'revision.json'), 'utf8')) as Record<string, string>).filter(([name]) =>
      isSnapshotSourceName(name),
    ),
  )

async function seedHistory() {
  const response = await fetchWithRetry(`${base}/changes/seed.json`, { cache: 'no-store' }).catch(() => null)
  if (!response?.ok) {
    console.log(`no history seed at ${base}/changes/seed.json${response ? ` (${response.status})` : ''}`)
    return null
  }
  return parseCatalogueHistory(await response.text(), 'changes/seed.json')
}

try {
  const previousDirectory = path.join(work, 'published')
  const pointer = await (async () => {
    try {
      const current = await fetchCurrentPointer(base)
      await fetchSnapshot(previousDirectory, base, current, (message) => console.log(message), {
        revocations: await remoteRevocations(base),
      })
      return current
    } catch (error) {
      console.log(`the published snapshot could not be read: ${error instanceof Error ? error.message : String(error)}`)
      return null
    }
  })()
  const nextRevisions = revisionsIn(directory)
  const next = {
    point: { id: '', revisions: nextRevisions, recordedAt: Date.now() } satisfies HistoryPoint,
    source: attempt('the new catalogue could not be compiled', () =>
      compiledChangeSource(
        directory,
        Object.keys(nextRevisions).filter((name) => isSnapshotSourceName(name)),
      ),
    ),
  }
  const previous = pointer
    ? {
        point: { id: pointer.id, revisions: revisionsIn(previousDirectory), recordedAt: 0 } satisfies HistoryPoint,
        history: loadCatalogueHistory(previousDirectory),
        source: attempt('the published snapshot could not be compiled', () => {
          const sources = historicalSnapshotSources(previousDirectory)
          if (!sources) throw new Error('today’s code does not read it as a complete snapshot')
          return compiledChangeSource(previousDirectory, sources)
        }),
      }
    : null
  if (repairLast) {
    const history = previous?.history
    const latest = history?.at(-1)
    if (
      !history ||
      !latest ||
      !/^[0-9a-f]{64}$/.test(latest.from) ||
      !previous?.source ||
      Object.entries(previous.point.revisions).some(([source, revision]) => latest.revisions[source] !== revision)
    ) {
      throw new Error('The latest published change has no readable snapshot baseline')
    }
    const response = await fetchWithRetry(`${base.replace(/\/$/, '')}/snapshots/${latest.from}.zip`)
    if (!response.ok) throw new Error(`Previous catalogue snapshot answered ${response.status}`)
    if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES) throw new Error('Previous catalogue snapshot is too large')
    const archive = path.join(work, 'baseline.zip')
    if (!response.body) throw new Error('Previous catalogue snapshot has no body')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > MAX_ARCHIVE_BYTES) throw new Error('Previous catalogue snapshot is too large')
      chunks.push(Buffer.from(chunk))
    }
    const bytes = Buffer.concat(chunks)
    fs.writeFileSync(archive, bytes)
    const baselineDirectory = path.join(work, 'baseline')
    installSnapshotArchive(
      baselineDirectory,
      archive,
      {
        format: 'praetorium.catalogue-pointer.v1',
        id: latest.from,
        archiveSha256: createHash('sha256').update(bytes).digest('hex'),
      },
      null,
    )
    const sources = historicalSnapshotSources(baselineDirectory)
    if (!sources) throw new Error('The previous catalogue snapshot is incomplete')
    const baseline = compiledChangeSource(baselineDirectory, sources)
    if (!baseline) throw new Error('The previous catalogue snapshot cannot be compiled')
    history[history.length - 1] = { ...latest, changes: catalogueChanges(baseline, previous.source) }
    console.log('recomputed the latest published change from its two verified snapshots')
  }
  const seed = previous?.history ? null : await seedHistory()
  const { history, appended, reason } = nextHistory({ previous, seed, next })
  console.log(reason)
  const file = path.join(directory, CATALOGUE_HISTORY_FILE)
  if (history) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ format: CATALOGUE_HISTORY_FORMAT, entries: history })}\n`)
    console.log(`${file}: ${history.length} change sets${appended ? ', one new' : ''}`)
  } else {
    fs.rmSync(file, { force: true })
    console.log('no data-update history to carry')
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
