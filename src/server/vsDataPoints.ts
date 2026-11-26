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
 * The current rules version's VS Data prices, from the construction file its release keeps beside its summaries in the
 * snapshot `directory` is; null for an earlier rules version, which keeps its field manual until its own app build's
 * prices are confirmed against it, and where the snapshot has none.
 */
export function vsPointsIn(directory: string, index: CatalogueIndex, editionId?: string): VsPointsIndex | null {
  const root = editionId && path.basename(path.dirname(directory)) === 'editions' ? path.resolve(directory, '..', '..') : directory
  const entry = readCatalogueComposition(root)?.editions.find((candidate) =>
    editionId ? candidate.edition.id === editionId : candidate.base,
  )
  if (!entry?.base) return null
  const id = entry?.summaries ?? entry?.edition.id ?? editionId
  const file = id ? path.join(root, 'summaries', `${id}.construction.json`) : null
  if (!file || !fs.existsSync(file)) return null
  const definitions = vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))))
  const name = (entryId: string) => {
    const definition = index.definitions.get(entryId)
    return definition && nameOf(definition, index.definitions)
  }
  return vsPointsIndex(definitions, ids, null, name)
}
