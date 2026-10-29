import { hash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  CATALOGUE_HISTORY_FORMAT,
  type CatalogueHistoryEntry,
  catalogueHistorySchema,
  historyKey,
  updateAnchor,
} from '../core/catalogueHistory'
import { compareText } from '../core/text'
import { reportServerFailure } from '../adapters/posthog'

/** Where a catalogue directory carries its history, packed and hashed with everything else. */
export const CATALOGUE_HISTORY_FILE = 'changes/history.json'

/** Far past any real history; a file this size is refused rather than read. */
export const MAX_CATALOGUE_HISTORY_BYTES = 16 * 1024 * 1024

/**
 * A history read from JSON text, oldest first, or null when the text is not one.
 *
 * Refused whole rather than repaired: a history that does not validate says nothing an
 * instance can show, and the page already has an honest empty state for that.
 */
export function parseCatalogueHistory(text: string, label: string): CatalogueHistoryEntry[] | null {
  if (text.length > MAX_CATALOGUE_HISTORY_BYTES) {
    reportServerFailure({ event: 'catalogue_history_refused', file: label, reason: 'too large' })
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    reportServerFailure({ event: 'catalogue_history_refused', file: label, reason: 'not JSON' })
    return null
  }
  const result = catalogueHistorySchema.safeParse(parsed)
  if (!result.success) {
    reportServerFailure({ event: 'catalogue_history_refused', file: label, reason: result.error.message })
    return null
  }
  return result.data.entries.toSorted(
    (left, right) => left.recordedAt - right.recordedAt || compareText(historyKey(left), historyKey(right)),
  )
}

/** Writes a history as `parseCatalogueHistory` reads it, refusing one an instance would refuse. */
export function writeCatalogueHistory(file: string, entries: readonly CatalogueHistoryEntry[]) {
  const json = JSON.stringify({ format: CATALOGUE_HISTORY_FORMAT, entries })
  if (!parseCatalogueHistory(json, file)) throw new Error(`${file} exceeds the catalogue history schema or size limit`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${json}\n`)
}

/** The history a catalogue directory carries, or null when it carries none that validates. */
export function loadCatalogueHistory(directory: string): CatalogueHistoryEntry[] | null {
  const file = path.join(directory, CATALOGUE_HISTORY_FILE)
  if (!fs.existsSync(file)) return null
  if (fs.statSync(file).size > MAX_CATALOGUE_HISTORY_BYTES) {
    reportServerFailure({ event: 'catalogue_history_refused', file, reason: 'too large' })
    return null
  }
  return parseCatalogueHistory(fs.readFileSync(file, 'utf8'), file)
}

/**
 * A digest of the key that already identifies an update, the same on every instance serving
 * the same history and independent of which page lists it.
 */
export const updateId = (entry: Pick<CatalogueHistoryEntry, 'from' | 'revisions'>) => hash('sha256', historyKey(entry)).slice(0, 16)

/** The fragment an update's row on the index is addressed by. */
export const historyAnchor = (entry: CatalogueHistoryEntry) => updateAnchor(entry.recordedAt, updateId(entry))
