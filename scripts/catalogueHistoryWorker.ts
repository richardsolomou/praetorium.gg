/**
 * One compile at a time, for `catalogueHistory.ts` and `catalogueHistorySeed.ts`: a catalogue
 * directory, or a published snapshot or point in upstream history materialised into a directory
 * laid out as a synced catalogue, compiled from its sources with today's code. Materialised
 * directories are removed again before the next task.
 */

import { execFileSync } from 'node:child_process'
import { hash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ChangeSource } from '../src/core/catalogueChanges'
import { boundedBytes } from '../src/server/boundedBody'
import { MAX_ARCHIVE_BYTES } from '../src/server/catalogueArchive'
import { historicalSnapshotSources, installSnapshotArchive, type SnapshotPointer } from '../src/server/catalogueSnapshot'
import { isSnapshotSourceName, type SnapshotSourceName } from '../src/server/catalogueSources'
import { fetchCatalogueObject } from '../src/server/catalogueStore'
import { extractSourceArchive } from '../src/server/sync'
import { compiledChangeSource, knownRevisions } from './lib/catalogueHistoryCompile'
import { errorText } from './lib/errorText'

export type WorkerTask =
  | { kind: 'directory'; directory: string; sources: SnapshotSourceName[] }
  | { kind: 'published'; id: string; base: string }
  | {
      kind: 'upstream'
      revisions: Record<string, string>
      /** Per source: where its clone is, and the path the sync extracts from it. */
      clones: Record<string, { directory: string; path?: string; repository: string }>
    }

export type WorkerResult = { ok: true; source: ChangeSource | null; revisions: Record<string, string> } | { ok: false; reason: string }

async function published(task: Extract<WorkerTask, { kind: 'published' }>, work: string): Promise<WorkerResult> {
  const archive = path.join(work, 'snapshot.zip')
  const directory = path.join(work, 'catalogue')
  const response = await fetchCatalogueObject(`${task.base}/snapshots/${task.id}.zip`)
  if (!response.ok) return { ok: false, reason: `snapshot answered ${response.status}` }
  const bytes = await boundedBytes(response, MAX_ARCHIVE_BYTES, 'snapshot is too large')
  fs.writeFileSync(archive, bytes)
  // The listing carries no archive checksum; the id is the manifest's hash and the manifest
  // hashes every file, so those still verify what is inside.
  const pointer: SnapshotPointer = { format: 'praetorium.catalogue-pointer.v1', id: task.id, archiveSha256: hash('sha256', bytes) }
  installSnapshotArchive(directory, archive, pointer, null)
  fs.rmSync(archive, { force: true })
  const sources = historicalSnapshotSources(directory)
  if (!sources) return { ok: false, reason: 'today’s code does not read it as a complete snapshot' }
  return { ok: true, source: compiledChangeSource(directory, sources), revisions: knownRevisions(directory) }
}

function upstream(task: Extract<WorkerTask, { kind: 'upstream' }>, work: string): WorkerResult {
  const directory = path.join(work, 'catalogue')
  fs.mkdirSync(directory, { recursive: true })
  const sources: SnapshotSourceName[] = []
  for (const [name, revision] of Object.entries(task.revisions)) {
    const clone = task.clones[name]
    if (!clone || !isSnapshotSourceName(name)) continue
    // The sync's own extraction, fed a zip of the clone at that revision in place of GitHub's
    // zipball, lays the source out exactly where a synced catalogue has it.
    const zip = execFileSync(
      'git',
      ['-C', clone.directory, 'archive', '--format=zip', '--prefix=source/', revision, ...(clone.path ? ['--', clone.path] : [])],
      { maxBuffer: 1024 * 1024 * 1024 },
    )
    extractSourceArchive(new Uint8Array(zip), clone.repository, path.join(directory, name), clone.path)
    sources.push(name)
  }
  fs.writeFileSync(path.join(directory, 'revision.json'), `${JSON.stringify(task.revisions, null, 2)}\n`)
  return { ok: true, source: compiledChangeSource(directory, sources), revisions: task.revisions }
}

process.on('message', (task: WorkerTask) => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'praetorium-history-'))
  const run = async (): Promise<WorkerResult> => {
    try {
      if (task.kind === 'directory') return { ok: true, source: compiledChangeSource(task.directory, task.sources), revisions: {} }
      return task.kind === 'published' ? await published(task, work) : upstream(task, work)
    } catch (error) {
      return { ok: false, reason: errorText(error) }
    } finally {
      fs.rmSync(work, { recursive: true, force: true })
    }
  }
  void run().then((result) => process.send?.(result))
})
