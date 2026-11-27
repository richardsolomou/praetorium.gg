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
import { type CatalogueComposition, readCatalogueComposition } from './catalogueComposition'

const ids: VsDataIds = {
  books: legacyIdsSchema.parse(rawBooks).ids,
  detachments: legacyIdsSchema.parse(rawDetachments).ids,
  units: legacyIdsSchema.parse(rawUnits).ids,
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
 * A rules version's VS Data stat lines, from its own release's construction file, with weapon keywords spelled by
 * `glossary`; null where the snapshot has none, and for a rules version `reads` leaves out. Only the current rules
 * version's are read so far: the earlier releases print many lines otherwise than the catalogue, in both directions.
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
  return vsProfilesIndex(
    vsDataDefinitions(found.construction),
    ids.units,
    found.entry.base ? null : found.entry.edition.id,
    glossary,
    (entryId) => nameIn(index, entryId),
  )
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

/** What VS Data's checker reads of a roster beyond its units' wargear: everything but options, wargear and points. */
const ROSTER_KINDS = ['faction', 'battle-size', 'detachment', 'enhancement', 'unit', 'model', 'allegiance']

/** A rules version's roster definitions, as VS Data's checker reads a list whose wargear the catalogue builds. */
export function vsRosterDefinitionsIn(directory: string, index: CatalogueIndex, editionId?: string): VsRosterData | null {
  const found = constructionIn(directory, editionId)
  if (!found) return null
  const { construction } = found
  const strip = (kind: string, data: Record<string, unknown>) => {
    if (kind === 'model')
      return {
        unit: data.unit,
        min: data.min,
        max: data.max,
        ...(data.bySize ? { bySize: data.bySize } : {}),
        ...(data.keywords ? { keywords: data.keywords } : {}),
        wargear: {},
      }
    if (kind !== 'unit') return data
    const {
      wargear: _wargear,
      defaults: _defaults,
      optionGroups: _groups,
      compositions: _compositions,
      modelGroups: _modelGroups,
      ...kept
    } = data
    return kept
  }
  const pruned: VsDataConstruction = {
    release: construction.release,
    rulesVersion: construction.rulesVersion,
    unavailable: construction.unavailable,
    ...(construction.replacements ? { replacements: construction.replacements } : {}),
    points: [],
    definitions: Object.fromEntries(
      ROSTER_KINDS.map((kind) => [
        kind,
        Object.fromEntries(
          Object.entries(construction.definitions[kind] ?? {}).map(([id, record]) => [
            id,
            { name: record.name, data: strip(kind, record.data) },
          ]),
        ),
      ]),
    ),
  }
  return vsRosterData(pruned, ids, found.entry.base ? null : found.entry.edition.id, (entryId) => nameIn(index, entryId))
}
