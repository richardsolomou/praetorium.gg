import fs from 'node:fs'
import path from 'node:path'
import { type CatalogueHistoryEntry, catalogueHistorySchema, historyKey } from '../core/catalogueHistory'
import { compareText } from '../core/text'

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
    console.error({ event: 'catalogue_history_refused', file: label, reason: 'too large' })
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    console.error({ event: 'catalogue_history_refused', file: label, reason: 'not JSON' })
    return null
  }
  const result = catalogueHistorySchema.safeParse(parsed)
  if (!result.success) {
    console.error({ event: 'catalogue_history_refused', file: label, reason: result.error.message })
    return null
  }
  return result.data.entries.toSorted(
    (left, right) => left.recordedAt - right.recordedAt || compareText(historyKey(left), historyKey(right)),
  )
}

/** The history a catalogue directory carries, or null when it carries none that validates. */
export function loadCatalogueHistory(directory: string): CatalogueHistoryEntry[] | null {
  const file = path.join(directory, CATALOGUE_HISTORY_FILE)
  if (!fs.existsSync(file)) return null
  if (fs.statSync(file).size > MAX_CATALOGUE_HISTORY_BYTES) {
    console.error({ event: 'catalogue_history_refused', file, reason: 'too large' })
    return null
  }
  return parseCatalogueHistory(fs.readFileSync(file, 'utf8'), file)
}
