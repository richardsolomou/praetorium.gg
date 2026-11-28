import fs from 'node:fs'
import path from 'node:path'
import rawBooks from '../../catalogue/legacy-ids/books.json' with { type: 'json' }
import rawDetachments from '../../catalogue/legacy-ids/detachments.json' with { type: 'json' }
import rawEnhancements from '../../catalogue/legacy-ids/enhancements.json' with { type: 'json' }
import rawUnits from '../../catalogue/legacy-ids/units.json' with { type: 'json' }
import { type CatalogueIndex, nameOf } from '../core/catalogue'
import { legacyIdsSchema } from '../core/legacyIds'
import { type VsDataConstruction, vsDataConstructionSchema, vsDataDefinitions } from '../core/vsDataConstruction'
import { type VsDataIds, type VsPointsIndex, vsPointsIndex } from '../shared/vsDataPoints'
import { type VsRosterData, vsRosterData } from '../shared/vsDataLegality'
import { type VsProfilesIndex, vsProfilesIndex } from '../shared/vsDataProfiles'
import { vsLinksIndex } from '../shared/vsDataAttachments'
import { type CatalogueComposition, readCatalogueComposition } from './catalogueComposition'

/** The frozen map from each BSData datasheet, or `<book>/<datasheet>`, to its VS Data unit (`catalogue/legacy-ids/units.json`). */
export const legacyUnitIds = legacyIdsSchema.parse(rawUnits).ids

const ids: VsDataIds = {
  books: legacyIdsSchema.parse(rawBooks).ids,
  detachments: legacyIdsSchema.parse(rawDetachments).ids,
  units: legacyUnitIds,
  enhancements: legacyIdsSchema.parse(rawEnhancements).ids,
}

/**
 * A rules version's VS Data prices, from the construction file its own release keeps beside its summaries in the
 * snapshot `directory` is, or is under for a rules version; null where the snapshot has none.
 */
export function vsPointsIn(directory: string, index: CatalogueIndex, editionId?: string): VsPointsIndex | null {
  const found = constructionIn(directory, editionId)
  if (!found) return null
  return vsPointsIndex(vsDataDefinitions(found.construction), ids, found.entry.base ? null : found.entry.edition.id, (entryId) =>
    nameIn(index, entryId),
  )
}

/**
 * A rules version's VS Data stat lines, attachments and transport capacities, from its own release's construction file,
 * with weapon keywords spelled by `glossary`; null where the snapshot has none, and for a rules version `reads` leaves
 * out. Only the current rules version's are read so far: the earlier releases print many lines otherwise than the
 * catalogue, in both directions.
 */
export function vsProfilesIn(
  directory: string,
  index: CatalogueIndex,
  glossary: readonly string[],
  editionId?: string,
  reads: (entry: CatalogueComposition['editions'][number]) => boolean = (entry) => Boolean(entry.base),
): VsProfilesIndex | null {
  const found = constructionIn(directory, editionId)
  if (!found || !reads(found.entry)) return null
  const definitions = vsDataDefinitions(found.construction)
  const edition = found.entry.base ? null : found.entry.edition.id
  const name = (entryId: string) => nameIn(index, entryId)
  return { ...vsProfilesIndex(definitions, ids.units, edition, glossary, name), ...vsLinksIndex(definitions, ids, edition, name) }
}

const nameIn = (index: CatalogueIndex, entryId: string) => {
  const definition = index.definitions.get(entryId)
  return definition && nameOf(definition, index.definitions)
}

/** A rules version's own construction file, read from the snapshot `directory` is, or is under for a rules version. */
function constructionIn(
  directory: string,
  editionId: string | undefined,
): { entry: CatalogueComposition['editions'][number]; construction: VsDataConstruction } | null {
  const root = editionId && path.basename(path.dirname(directory)) === 'editions' ? path.resolve(directory, '..', '..') : directory
  const entry = readCatalogueComposition(root)?.editions.find((candidate) =>
    editionId ? candidate.edition.id === editionId : candidate.base,
  )
  if (!entry) return null
  const file = path.join(root, 'summaries', `${entry.base ? (entry.summaries ?? entry.edition.id) : entry.edition.id}.construction.json`)
  if (!fs.existsSync(file)) return null
  return { entry, construction: vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) }
}

/** A rules version's roster definitions and points: what VS Data's checker reads of a list and what a VS pick is built and priced from. */
export function vsRosterDefinitionsIn(directory: string, index: CatalogueIndex, editionId?: string): VsRosterData | null {
  const found = constructionIn(directory, editionId)
  if (!found) return null
  return vsRosterData(found.construction, ids, found.entry.base ? null : found.entry.edition.id, (entryId) => nameIn(index, entryId))
}
