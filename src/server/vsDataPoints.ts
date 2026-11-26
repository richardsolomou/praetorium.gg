import fs from 'node:fs'
import path from 'node:path'
import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import rawDetachments from '../../catalogue/legacy-ids/detachments.json' with { type: 'json' }
import rawEnhancements from '../../catalogue/legacy-ids/enhancements.json' with { type: 'json' }
import rawUnits from '../../catalogue/legacy-ids/units.json' with { type: 'json' }
import { type CatalogueIndex, nameOf } from '../core/catalogue'
import { legacyIdsSchema } from '../core/legacyIds'
import { vsDataConstructionSchema, vsDataDefinitions } from '../core/vsDataConstruction'
import { type VsDataIds, type VsPointsIndex, vsPointsIndex } from '../shared/vsDataPoints'
import { readCatalogueComposition } from './catalogueComposition'

const ids: VsDataIds = {
  books: legacyIdsSchema.parse(rawBooks).ids,
  detachments: legacyIdsSchema.parse(rawDetachments).ids,
  units: legacyIdsSchema.parse(rawUnits).ids,
  enhancements: legacyIdsSchema.parse(rawEnhancements).ids,
}

/**
 * The earlier rules versions whose own VS Data release prices them as the app build in force did, checked unit by unit
 * against it. `legacy-rosters` (MFM 1.4) and `legacy-profiles` (MFM 1.5 before the Space Marines codex) are not: their
 * releases read the build after theirs, so they keep their field manual until VS Data reads the right one.
 */
const PRICED_EARLIER_VERSIONS = new Set(['legacy-marine-old', 'current-rosters', 'marine-main', 'marine-2026-10-13', 'marine-points-1013'])

/**
 * A rules version's VS Data prices, from the construction file its own release keeps beside its summaries in the
 * snapshot `directory` is, or is under for a rules version; null for one that keeps its field manual, and where the
 * snapshot has none.
 */
export function vsPointsIn(directory: string, index: CatalogueIndex, editionId?: string): VsPointsIndex | null {
  const root = editionId && path.basename(path.dirname(directory)) === 'editions' ? path.resolve(directory, '..', '..') : directory
  const entry = readCatalogueComposition(root)?.editions.find((candidate) =>
    editionId ? candidate.edition.id === editionId : candidate.base,
  )
  if (!entry || !(entry.base || PRICED_EARLIER_VERSIONS.has(entry.edition.id))) return null
  const file = path.join(root, 'summaries', `${entry.base ? (entry.summaries ?? entry.edition.id) : entry.edition.id}.construction.json`)
  if (!fs.existsSync(file)) return null
  const definitions = vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))))
  const name = (entryId: string) => {
    const definition = index.definitions.get(entryId)
    return definition && nameOf(definition, index.definitions)
  }
  return vsPointsIndex(definitions, ids, entry.base ? null : entry.edition.id, name)
}
