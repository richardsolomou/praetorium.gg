/**
 * Builds the data-update history the publisher starts from, `changes/seed.json` in the bucket.
 *
 *   pnpm catalogue:history-seed --out seed.json [--workers <n>] [--no-upstream] [--upstream-from <yyyy-mm-dd>]
 *
 * Every published snapshot is compared with the one before it, and before publishing began
 * the sources' own git history is replayed a day at a time, so the history reaches back to
 * the first day the catalogue existed. Both sides of every comparison are compiled from
 * sources with today's code, so a difference between two compiler versions never reads as
 * a data change.
 */

import { execFileSync, fork, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { type ChangeSource, catalogueChanges } from '../src/core/catalogueChanges'
import { appendHistory, CATALOGUE_HISTORY_FORMAT, type CatalogueHistoryEntry } from '../src/core/catalogueHistory'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from '../src/server/canonicalCatalogueSources'
import { catalogueBaseUrl, remoteRevocations } from '../src/server/catalogueSnapshot'
import { catalogueSourcesSchema } from '../src/server/catalogueSources'
import { fetchWithRetry } from '../src/server/fetch'
import {
  compareInOrder,
  dailyCheckpoints,
  type HistoryPoint,
  historyEntry,
  type ListedSnapshot,
  parseSnapshotListing,
  type SourceCommit,
  snapshotsToCompare,
  upstreamId,
} from './catalogueHistoryPlan'
import type { WorkerResult, WorkerTask } from './catalogueHistoryWorker'

const root = path.join(import.meta.dirname, '..')
const args = process.argv.slice(2).filter((arg) => arg !== '--')
const option = (name: string) => {
  const at = args.indexOf(name)
  return at < 0 ? undefined : args[at + 1]
}
const out = option('--out')
if (!out) throw new Error('--out <file> names where the history is written')
const upstreamFrom = option('--upstream-from')
const withUpstream = !args.includes('--no-upstream')
// Each compile holds a whole catalogue, so memory bounds the pool as well as the cores do.
const workers = Number(option('--workers') ?? Math.max(1, Math.min(os.cpus().length - 2, Math.floor(os.totalmem() / (3 * 1024 ** 3)))))
const clonesRoot = path.resolve(
  option('--clones') ?? path.join(process.env.XDG_CACHE_HOME?.trim() || path.join(os.homedir(), '.cache'), 'praetorium', 'upstream'),
)

const started = performance.now()
const base = catalogueBaseUrl()
const git = (...command: string[]) => execFileSync('git', command, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

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

const published = snapshotsToCompare(await listed(), (await remoteRevocations(base)).snapshots)
if (!published.length) throw new Error('the bucket lists no published snapshots')

/** Each compiled source's clone, fetched once and kept for the next run. */
function upstreamSources() {
  const config = catalogueSourcesSchema.parse(JSON.parse(fs.readFileSync(path.join(root, 'catalogue', 'sources.json'), 'utf8')))
  return CANONICAL_CATALOGUE_SOURCE_NAMES.map((name) => {
    const source = config[name]
    const directory = path.join(clonesRoot, source.repository.replace('/', '__'))
    if (fs.existsSync(path.join(directory, 'HEAD')) || fs.existsSync(path.join(directory, '.git'))) {
      git('-C', directory, 'fetch', '--quiet', 'origin', source.branch)
    } else {
      fs.mkdirSync(path.dirname(directory), { recursive: true })
      git(
        'clone',
        '--quiet',
        '--bare',
        '--single-branch',
        '--branch',
        source.branch,
        `https://github.com/${source.repository}.git`,
        directory,
      )
    }
    const ref = `refs/heads/${source.branch}`
    if (fs.existsSync(path.join(directory, 'FETCH_HEAD'))) git('-C', directory, 'update-ref', ref, 'FETCH_HEAD')
    const log = git(
      '-C',
      directory,
      'log',
      '--first-parent',
      '--format=%H %ct',
      ref,
      ...('path' in source && source.path ? ['--', source.path] : []),
    )
    const commits: SourceCommit[] = log
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [sha, seconds] = line.split(' ')
        return { sha: sha!, at: Number(seconds) * 1000 }
      })
    return { name, directory, repository: source.repository, path: 'path' in source ? source.path : undefined, commits }
  })
}

type Point = HistoryPoint & { task: WorkerTask | null; missing: string[]; label: string }

const points: Point[] = []
if (withUpstream) {
  const sources = upstreamSources()
  const firstDay =
    upstreamFrom ??
    new Date(Math.min(...(sources.find((source) => source.name === 'definitions')?.commits.map((commit) => commit.at) ?? [Date.now()])))
      .toISOString()
      .slice(0, 10)
  const lastDay = new Date(Date.parse(`${new Date(published[0]!.publishedAt).toISOString().slice(0, 10)}T00:00:00Z`) - 1)
    .toISOString()
    .slice(0, 10)
  const checkpoints = dailyCheckpoints(Object.fromEntries(sources.map((source) => [source.name, source.commits])), firstDay, lastDay)
  console.log(`upstream history ${firstDay} to ${lastDay}: ${checkpoints.length} checkpoints`)
  const clones = Object.fromEntries(
    sources.map((source) => [source.name, { directory: source.directory, repository: source.repository, path: source.path }]),
  )
  for (const checkpoint of checkpoints) {
    points.push({
      id: upstreamId(checkpoint.day, checkpoint.revisions),
      revisions: checkpoint.revisions,
      recordedAt: checkpoint.recordedAt,
      missing: checkpoint.missing,
      label: checkpoint.day,
      task: checkpoint.missing.length ? null : { kind: 'upstream', revisions: checkpoint.revisions, clones },
    })
  }
}
for (const snapshot of published) {
  points.push({
    id: snapshot.id,
    revisions: {},
    recordedAt: snapshot.publishedAt,
    missing: [],
    label: `${new Date(snapshot.publishedAt).toISOString()} ${snapshot.id.slice(0, 10)}`,
    task: { kind: 'published', id: snapshot.id, base },
  })
}
console.log(`compiling ${points.filter((point) => point.task).length} points with ${workers} workers`)

/** A fixed pool of compile processes, each holding at most one catalogue directory. */
const idle: ChildProcess[] = []
const waiting: (() => void)[] = []
const workerFile = path.join(import.meta.dirname, 'catalogueHistoryWorker.ts')
for (let at = 0; at < workers; at++) idle.push(fork(workerFile, [], { execArgv: ['--import', 'tsx', '--max-old-space-size=4096'] }))
async function compile(task: WorkerTask): Promise<WorkerResult> {
  while (!idle.length) await new Promise<void>((resolve) => waiting.push(resolve))
  const worker = idle.pop()!
  try {
    return await new Promise<WorkerResult>((resolve, reject) => {
      worker.once('message', (result: WorkerResult) => resolve(result))
      worker.once('exit', (code) => reject(new Error(`a compile process exited with ${code}`)))
      worker.send(task)
    })
  } finally {
    worker.removeAllListeners('exit')
    idle.push(worker)
    waiting.shift()?.()
  }
}
const compiled = new Map(points.map((point) => [point, point.task ? compile(point.task) : null]))

let history: CatalogueHistoryEntry[] = []
const { skipped } = await compareInOrder(
  points,
  async (point): Promise<{ source: ChangeSource; point: HistoryPoint } | null> => {
    const pending = compiled.get(point)
    compiled.delete(point)
    if (!pending) throw new Error(`no ${point.missing.join(', ')} yet`)
    const result = await pending
    if (!result.ok) throw new Error(result.reason)
    return result.source ? { source: result.source, point: { ...point, revisions: result.revisions } } : null
  },
  async (older, newer) => {
    const entry = historyEntry(older.value.point, newer.value.point, catalogueChanges(older.value.source, newer.value.source))
    const before = history.length
    history = appendHistory(history, entry)
    if (history.length > before) {
      const count = entry.changes.factions.reduce((total, faction) => total + faction.changes.length, 0) + entry.changes.omitted
      console.log(`${newer.point.label}: ${count} changes`)
    }
  },
)
for (const worker of idle) worker.kill()
for (const { point, reason } of skipped) console.log(`skipped ${point.label}: ${reason}`)
fs.writeFileSync(out, `${JSON.stringify({ format: CATALOGUE_HISTORY_FORMAT, entries: history })}\n`)
console.log(
  `${history.length} change sets, ${skipped.length} of ${points.length} points skipped, ${out} ${fs.statSync(out).size} bytes, ${Math.round((performance.now() - started) / 1000)}s`,
)
