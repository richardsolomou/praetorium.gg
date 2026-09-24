import type { CatalogueChangeSet } from '../src/core/catalogueChanges'
import { compareText } from '../src/core/text'

/** One published snapshot in the bucket, as its listing names it. */
export type ListedSnapshot = { id: string; publishedAt: number }

export type ChangeRecord = { fromSnapshot: string; toSnapshot: string; recordedAt: number; changes: CatalogueChangeSet }

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
 * the newest few — and the snapshot before the first of them comes along as its baseline.
 */
export function snapshotsToCompare(
  listed: readonly ListedSnapshot[],
  revoked: readonly string[],
  bound: { since?: number; last?: number } = {},
): ListedSnapshot[] {
  const withdrawn = new Set(revoked)
  const ordered = listed
    .filter((snapshot) => !withdrawn.has(snapshot.id))
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
 * Walks the snapshots oldest first, comparing each one that loads with the last one that
 * did. A snapshot today's code cannot read is skipped, so its neighbours are compared
 * directly rather than the history stopping there. Only one loaded value is held at a time.
 */
export async function compareInOrder<T>(
  snapshots: readonly ListedSnapshot[],
  load: (snapshot: ListedSnapshot) => Promise<T | null>,
  compare: (older: { snapshot: ListedSnapshot; value: T }, newer: { snapshot: ListedSnapshot; value: T }) => Promise<void>,
) {
  const skipped: { snapshot: ListedSnapshot; reason: string }[] = []
  let previous: { snapshot: ListedSnapshot; value: T } | null = null
  for (const snapshot of snapshots) {
    let value: T | null
    try {
      value = await load(snapshot)
    } catch (error) {
      skipped.push({ snapshot, reason: error instanceof Error ? error.message : String(error) })
      continue
    }
    if (value === null) {
      skipped.push({ snapshot, reason: 'no reference catalogue' })
      continue
    }
    const current = { snapshot, value }
    if (previous) await compare(previous, current)
    previous = current
  }
  return { skipped }
}

/** A string as a standard SQL literal: quotes doubled, everything else as written. */
export const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`

/**
 * Statements `psql` can apply to add these records to `catalogue_changes`, safely more than
 * once: the table's key is the snapshot pair, so a pair already there is left alone.
 */
export function insertStatements(records: readonly ChangeRecord[]) {
  const lines = records.map(
    (record) =>
      `INSERT INTO catalogue_changes (from_snapshot, to_snapshot, recorded_at, body) VALUES (${sqlString(record.fromSnapshot)}, ${sqlString(record.toSnapshot)}, ${Math.trunc(record.recordedAt)}, ${sqlString(JSON.stringify(record.changes))}) ON CONFLICT DO NOTHING;`,
  )
  // Backslashes in the JSON are data, which is how a standard string reads them.
  return ['SET standard_conforming_strings = on;', 'BEGIN;', ...lines, 'COMMIT;', ''].join('\n')
}
