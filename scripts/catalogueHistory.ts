/**
 * Carries the data-update history into the snapshot about to be packed.
 *
 *   pnpm catalogue:history
 *
 * Run by the publisher after the sources are synced into `catalogue-data` and before
 * `pnpm catalogue:snapshot pack`. Normal updates carry forward unreadable history; an
 * explicit `--repair-last` fails if it cannot verify both snapshots it compares.
 */

import { fork } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CATALOGUE_HISTORY_FILE, loadCatalogueHistory, parseCatalogueHistory, writeCatalogueHistory } from '../src/server/catalogueHistory'
import {
  catalogueBaseUrl,
  fetchCurrentPointer,
  fetchSnapshot,
  historicalSnapshotSources,
  remoteRevocations,
} from '../src/server/catalogueSnapshot'
import { isSnapshotSourceName } from '../src/server/catalogueSources'
import { fetchCatalogueObject } from '../src/server/catalogueStore'
import { catalogueChanges, type ChangeSource } from '../src/core/catalogueChanges'
import { knownRevisions } from './lib/catalogueHistoryCompile'
import type { WorkerResult, WorkerTask } from './catalogueHistoryWorker'
import { type HistoryPoint, nextHistory } from './lib/catalogueHistoryPlan'
import { editionMfmVersions, readCatalogueComposition, validateEditionContinuity } from '../src/server/catalogueComposition'
import { catalogueDataDirectory } from './lib/catalogueFiles'
import { errorText } from './lib/errorText'

const directory = catalogueDataDirectory()
const base = catalogueBaseUrl()
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-history-'))
const repairLast = process.argv.includes('--repair-last')

/** Compiles a catalogue directory in its own process, so the published and the new catalogue compile at once. */
function compileApart(task: WorkerTask) {
  const worker = fork(path.join(import.meta.dirname, 'catalogueHistoryWorker.ts'), [], {
    execArgv: ['--import', 'tsx', '--max-old-space-size=8192'],
  })
  return new Promise<WorkerResult>((resolve, reject) => {
    worker.once('message', (result: WorkerResult) => resolve(result))
    worker.once('exit', (code) => reject(new Error(`a compile process exited with ${code}`)))
    worker.send(task)
  }).finally(() => worker.disconnect())
}

const compiled = async (label: string, pending: Promise<WorkerResult>): Promise<ChangeSource | null> => {
  const result = await pending
  if (result.ok) return result.source
  console.log(`${label}: ${result.reason}`)
  return null
}

async function seedHistory() {
  const response = await fetchCatalogueObject(`${base}/changes/seed.json`, { cache: 'no-store' }).catch(() => null)
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
      console.log(`the published snapshot could not be read: ${errorText(error)}`)
      return null
    }
  })()
  const nextRevisions = knownRevisions(directory)
  const composition = readCatalogueComposition(directory)
  if (composition?.editions.length && !pointer) throw new Error('edition history requires a readable published snapshot')
  if (pointer) {
    const previousComposition = readCatalogueComposition(previousDirectory)
    validateEditionContinuity(previousComposition, composition, {
      previous: editionMfmVersions(previousDirectory, previousComposition),
      next: editionMfmVersions(directory, composition),
    })
  }
  const nextCompile = compileApart({
    kind: 'directory',
    directory,
    sources: Object.keys(nextRevisions).filter((name) => isSnapshotSourceName(name)),
  })
  const previousSources = pointer ? historicalSnapshotSources(previousDirectory) : null
  const previousCompile = previousSources
    ? compileApart({ kind: 'directory', directory: previousDirectory, sources: previousSources })
    : Promise.resolve<WorkerResult>({ ok: false, reason: 'today’s code does not read it as a complete snapshot' })
  const next = {
    point: { id: '', revisions: nextRevisions, recordedAt: Date.now() } satisfies HistoryPoint,
    source: await compiled('the new catalogue could not be compiled', nextCompile),
  }
  const previous = pointer
    ? {
        point: { id: pointer.id, revisions: knownRevisions(previousDirectory), recordedAt: 0 } satisfies HistoryPoint,
        history: loadCatalogueHistory(previousDirectory),
        source: await compiled('the published snapshot could not be compiled', previousCompile),
      }
    : null
  if (composition?.editions.length && (!next.source || !previous?.source))
    throw new Error('both edition catalogues must compile before publishing their history')
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
    const baseline = await compileApart({ kind: 'published', id: latest.from, base })
    if (!baseline.ok) throw new Error(`The previous catalogue snapshot cannot be read: ${baseline.reason}`)
    if (!baseline.source) throw new Error('The previous catalogue snapshot cannot be compiled')
    history[history.length - 1] = { ...latest, changes: catalogueChanges(baseline.source, previous.source) }
    console.log('recomputed the latest published change from its two verified snapshots')
  }
  const seed = previous?.history ? null : await seedHistory()
  const { history, appended, reason } = nextHistory({ previous, seed, next })
  console.log(reason)
  const file = path.join(directory, CATALOGUE_HISTORY_FILE)
  if (history) {
    writeCatalogueHistory(file, history)
    console.log(`${file}: ${history.length} change sets${appended ? ', one new' : ''}`)
  } else {
    fs.rmSync(file, { force: true })
    console.log('no data-update history to carry')
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true })
}
