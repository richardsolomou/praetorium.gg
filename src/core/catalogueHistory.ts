import { z } from 'zod'
import { fromBase64Url, toBase64Url } from './base64'
import {
  type CatalogueChange,
  type CatalogueChangeSet,
  catalogueChangeSetSchema,
  isEmptyChangeSet,
  type RecordedChangeSet,
} from './catalogueChanges'
import { compareText } from './text'

/**
 * Every recorded army-data update, as a published snapshot carries it.
 *
 * A snapshot's id is the hash of what it packs, so no entry can name the snapshot that
 * carries it. An entry names where the change started instead — the previous published
 * snapshot's id, or a reconstructed `upstream:` id for history before publishing began —
 * and the source revisions the change arrived at. Together those identify it, which is
 * what makes appending the same change twice a no-op.
 */
export type CatalogueHistoryEntry = {
  from: string
  revisions: Record<string, string>
  recordedAt: number
  changes: CatalogueChangeSet
}

type CatalogueHistory = { format: typeof CATALOGUE_HISTORY_FORMAT; entries: CatalogueHistoryEntry[] }

export const CATALOGUE_HISTORY_FORMAT = 'praetorium.catalogue-history.v1' as const

/** Years of hourly publishing, each entry bounded by the change set's own limit. */
export const CATALOGUE_HISTORY_LIMIT = 5000

export const catalogueHistorySchema: z.ZodType<CatalogueHistory> = z.object({
  format: z.literal(CATALOGUE_HISTORY_FORMAT),
  entries: z
    .array(
      z.object({
        from: z.string().min(1),
        revisions: z.record(z.string(), z.string()),
        recordedAt: z.number().int().nonnegative(),
        changes: catalogueChangeSetSchema,
      }),
    )
    .max(CATALOGUE_HISTORY_LIMIT),
})

/** What identifies an entry: where it started and the revisions it arrived at. */
export const historyKey = (entry: Pick<CatalogueHistoryEntry, 'from' | 'revisions'>) =>
  JSON.stringify([entry.from, Object.entries(entry.revisions).toSorted(([left], [right]) => compareText(left, right))])

/**
 * The history with one more entry, oldest first. An entry already there, or one that
 * changed nothing, leaves the history as it was, so running the same publish twice
 * writes the same file.
 */
export function appendHistory(history: readonly CatalogueHistoryEntry[], entry: CatalogueHistoryEntry): CatalogueHistoryEntry[] {
  if (isEmptyChangeSet(entry.changes)) return [...history]
  const key = historyKey(entry)
  if (history.some((known) => historyKey(known) === key)) return [...history]
  return [...history, entry].toSorted(
    (left, right) => left.recordedAt - right.recordedAt || compareText(historyKey(left), historyKey(right)),
  )
}

/** Where a page of history ended: its last entry's time and key. */
type HistoryCursor = { recordedAt: number; key: string }

/**
 * One page of history, newest first, and where the next page starts. The order is total —
 * time, then key — so entries sharing a time each land on exactly one page.
 */
export function historyPage(history: readonly CatalogueHistoryEntry[], limit: number, before?: HistoryCursor) {
  const newestFirst = history
    .map((entry) => ({ entry, key: historyKey(entry) }))
    .toSorted((left, right) => right.entry.recordedAt - left.entry.recordedAt || compareText(right.key, left.key))
  const remaining = before
    ? newestFirst.filter(
        ({ entry, key }) =>
          entry.recordedAt < before.recordedAt || (entry.recordedAt === before.recordedAt && compareText(key, before.key) < 0),
      )
    : newestFirst
  const page = remaining.slice(0, limit)
  const last = page.at(-1)
  return {
    entries: page.map(({ entry }) => entry),
    next: last && remaining.length > limit ? { recordedAt: last.entry.recordedAt, key: last.key } : null,
  }
}

/** A cursor as it rides in an address: URL-safe base64 of its JSON. */
export function encodeHistoryCursor(cursor: HistoryCursor) {
  return toBase64Url(new TextEncoder().encode(JSON.stringify([cursor.recordedAt, cursor.key])))
}

/** The cursor an address names, or null for anything that is not one. */
export function decodeHistoryCursor(text: string): HistoryCursor | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(text)))
    const cursor = z.tuple([z.number().int().nonnegative(), z.string().min(1)]).safeParse(parsed)
    return cursor.success ? { recordedAt: cursor.data[0], key: cursor.data[1] } : null
  } catch {
    return null
  }
}

/** The newest few entries recorded after a time, which is all a saved list is compared with. */
export function historySince(history: readonly CatalogueHistoryEntry[], after: number, limit: number): RecordedChangeSet[] {
  return history
    .filter((entry) => entry.recordedAt > after)
    .slice(-limit)
    .map(({ recordedAt, changes }) => ({ recordedAt, changes }))
}

/** An update with at most this many changes is shown open on the index; a larger one starts closed. */
const INLINE_UPDATE_CHANGES = 5

/** Changes that the same armies all recorded. */
type SharedChanges = { factions: { catalogueId: string; faction: string }[]; changes: CatalogueChange[] }

/**
 * An update's changes, each said once under every army that recorded it, in groups of the
 * changes the same armies share. Armies built on one book, such as the Space Marine chapters,
 * record the same change apiece, which would otherwise repeat for every one of them.
 */
function sharedChanges(changes: CatalogueChangeSet): SharedChanges[] {
  const armies = new Map<string, { change: CatalogueChange; factions: SharedChanges['factions'] }>()
  for (const { catalogueId, faction, changes: recorded } of changes.factions)
    for (const change of recorded) {
      const shared = armies.get(JSON.stringify(change)) ?? { change, factions: [] }
      shared.factions.push({ catalogueId, faction })
      armies.set(JSON.stringify(change), shared)
    }
  const groups = new Map<string, SharedChanges>()
  for (const { change, factions } of armies.values()) {
    const key = JSON.stringify(factions.map((faction) => faction.catalogueId))
    const group = groups.get(key) ?? { factions, changes: [] }
    group.changes.push(change)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/**
 * What an update's row says: its changes grouped by the armies that share them, how many
 * distinct changes there are, the ones past the change set's bound included, and whether it
 * is small enough to start open.
 */
export function updateSummary(changes: CatalogueChangeSet) {
  const groups = sharedChanges(changes)
  const total = groups.reduce((sum, group) => sum + group.changes.length, 0) + changes.omitted
  return { groups, total, open: total <= INLINE_UPDATE_CHANGES }
}

/**
 * The fragment an update's row on the index is addressed by: the UTC day it was recorded,
 * readable in an address, and the start of a digest of the key that identifies it, which
 * tells two updates of one day apart. Both come from the history alone, so the fragment is
 * the same on every instance serving it and on whichever page lists the update.
 */
export const updateAnchor = (recordedAt: number, digest: string) =>
  `update-${new Date(recordedAt).toISOString().slice(0, 10)}-${digest.slice(0, 8)}`
