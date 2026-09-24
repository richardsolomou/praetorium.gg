import { createHash } from 'node:crypto'
import { catalogueChanges, type ChangeSource } from '../src/core/catalogueChanges'
import { appendHistory, type CatalogueHistoryEntry } from '../src/core/catalogueHistory'
import { compareText } from '../src/core/text'

/** One published snapshot in the bucket, as its listing names it. */
export type ListedSnapshot = { id: string; publishedAt: number }

const decodeXml = (value: string) =>
  value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')

/**
 * One page of an S3 ListObjectsV2 answer for `snapshots/`: every archive named by its
 * snapshot id, with when it was published, and the token for the next page.
 */
export function parseSnapshotListing(xml: string): { snapshots: ListedSnapshot[]; next: string | null } {
  const snapshots = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].flatMap(([, contents]) => {
    const id = contents?.match(/<Key>snapshots\/([0-9a-f]{64})\.zip<\/Key>/)?.[1]
    const modified = contents?.match(/<LastModified>([^<]+)<\/LastModified>/)?.[1]
    const publishedAt = modified ? Date.parse(modified) : Number.NaN
    return id && Number.isFinite(publishedAt) ? [{ id, publishedAt }] : []
  })
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml)
  const token = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/)?.[1]
  return { snapshots, next: truncated && token ? decodeXml(token) : null }
}

/**
 * The snapshots to compare, oldest first, without revoked ones.
 *
 * A bound names the snapshots whose changes are wanted — those published since a time, or
 * the newest few, up to a time when one is given — and the snapshot before the first of
 * them comes along as its baseline.
 */
export function snapshotsToCompare(
  listed: readonly ListedSnapshot[],
  revoked: readonly string[],
  bound: { since?: number; until?: number; last?: number } = {},
): ListedSnapshot[] {
  const withdrawn = new Set(revoked)
  const ordered = listed
    .filter((snapshot) => !withdrawn.has(snapshot.id) && (bound.until === undefined || snapshot.publishedAt <= bound.until))
    .toSorted((left, right) => left.publishedAt - right.publishedAt || compareText(left.id, right.id))
  const firstWanted =
    bound.last !== undefined
      ? Math.max(ordered.length - bound.last, 0)
      : bound.since !== undefined
        ? ordered.findIndex((snapshot) => snapshot.publishedAt >= bound.since!)
        : 0
  if (firstWanted < 0) return []
  return ordered.slice(Math.max(firstWanted - 1, 0))
}

/**
 * Walks the points in time oldest first, comparing each one that loads with the last one
 * that did. One today's code cannot read is skipped, so its neighbours are compared
 * directly rather than the history stopping there. Only one loaded value is held at a time.
 */
export async function compareInOrder<S, T>(
  points: readonly S[],
  load: (point: S) => Promise<T | null>,
  compare: (older: { point: S; value: T }, newer: { point: S; value: T }) => Promise<void> | void,
) {
  const skipped: { point: S; reason: string }[] = []
  let previous: { point: S; value: T } | null = null
  for (const point of points) {
    let value: T | null
    try {
      value = await load(point)
    } catch (error) {
      skipped.push({ point, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    if (value === null) {
      skipped.push({ point, reason: 'no reference catalogue' })
      continue
    }
    const current = { point, value }
    if (previous) await compare(previous, current)
    previous = current
  }
  return { skipped }
}

/** One commit a source made, by committer time. */
export type SourceCommit = { sha: string; at: number }

/** Upstream history at one UTC day's end: the revision each source had reached by then. */
export type Checkpoint = { day: string; recordedAt: number; revisions: Record<string, string>; missing: string[] }

const DAY = 24 * 60 * 60 * 1000
const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10)

/**
 * One checkpoint per UTC day from `firstDay` to `lastDay`, each source at its last commit on
 * or before that day's end. A day on which no source moved is the previous day again and is
 * left out. A source with no commit yet is named as missing, so its checkpoint is skipped
 * rather than compiled without it.
 */
export function dailyCheckpoints(
  histories: Readonly<Record<string, readonly SourceCommit[]>>,
  firstDay: string,
  lastDay: string,
): Checkpoint[] {
  const ordered = Object.entries(histories)
    .toSorted(([left], [right]) => compareText(left, right))
    .map(([name, commits]) => [name, commits.toSorted((left, right) => left.at - right.at)] as const)
  const checkpoints: Checkpoint[] = []
  let previous: string | null = null
  for (let start = Date.parse(`${firstDay}T00:00:00Z`); start <= Date.parse(`${lastDay}T00:00:00Z`); start += DAY) {
    const end = start + DAY - 1
    const revisions: Record<string, string> = {}
    const missing: string[] = []
    for (const [name, commits] of ordered) {
      const reached = commits.findLast((commit) => commit.at <= end)
      if (reached) revisions[name] = reached.sha
      else missing.push(name)
    }
    const state = JSON.stringify([revisions, missing])
    if (state === previous) continue
    previous = state
    checkpoints.push({ day: dayOf(start), recordedAt: end, revisions, missing })
  }
  return checkpoints
}

/**
 * The id a reconstructed point in upstream history goes by. It is plainly not a snapshot
 * id, because no snapshot was ever published for it, and it is the same wherever it is
 * rebuilt because it is made from the day and the sorted revisions alone.
 */
export function upstreamId(day: string, revisions: Readonly<Record<string, string>>) {
  const sorted = Object.entries(revisions).toSorted(([left], [right]) => compareText(left, right))
  return `upstream:${day}:${createHash('sha256').update(JSON.stringify(sorted)).digest('hex').slice(0, 12)}`
}

/** A point in time the history is told from: its id, the revisions it holds, and its time. */
export type HistoryPoint = { id: string; revisions: Record<string, string>; recordedAt: number }

/**
 * The entry for the change from one point to the next. It names the older point and the
 * newer one's revisions, never the newer one's id: a snapshot that carries its own history
 * cannot know the id its contents will hash to.
 */
export const historyEntry = (
  older: HistoryPoint,
  newer: HistoryPoint,
  changes: CatalogueHistoryEntry['changes'],
): CatalogueHistoryEntry => ({
  from: older.id,
  revisions: { ...newer.revisions },
  recordedAt: newer.recordedAt,
  changes,
})

/**
 * The history the next snapshot carries.
 *
 * It starts from the previous snapshot's own history, or from the seed when that snapshot
 * carries none, and gains the change between the two when both could be read. When the
 * previous snapshot could not be read at all, only the seed is left to carry, and when it
 * could be read but not compared, its history travels on unchanged: no change is recorded
 * that was not measured. Null means there is no history to write.
 */
export function nextHistory(input: {
  previous: { point: HistoryPoint; history: CatalogueHistoryEntry[] | null; source: ChangeSource | null } | null
  seed: CatalogueHistoryEntry[] | null
  next: { point: HistoryPoint; source: ChangeSource | null }
}): { history: CatalogueHistoryEntry[] | null; appended: CatalogueHistoryEntry | null; reason: string } {
  const { previous, seed, next } = input
  if (!previous) return { history: seed, appended: null, reason: 'the published snapshot could not be read, so only the seed is carried' }
  const base = previous.history ?? seed ?? []
  if (!previous.source || !next.source) {
    return {
      history: base.length ? base : null,
      appended: null,
      reason: 'the two snapshots could not both be compiled, so the history is carried unchanged',
    }
  }
  const entry = historyEntry(previous.point, next.point, catalogueChanges(previous.source, next.source))
  const history = appendHistory(base, entry)
  const appended = history.length > base.length ? entry : null
  return {
    history: history.length ? history : null,
    appended,
    reason: appended ? 'appended the change since the published snapshot' : 'nothing changed since the published snapshot',
  }
}
