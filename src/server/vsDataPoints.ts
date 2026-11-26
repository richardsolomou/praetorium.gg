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
import { type CatalogueComposition, readCatalogueComposition } from './catalogueComposition'

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
  const found = constructionIn(directory, editionId, (entry) => entry.base || PRICED_EARLIER_VERSIONS.has(entry.edition.id))
  if (!found) return null
  const name = (entryId: string) => {
    const definition = index.definitions.get(entryId)
    return definition && nameOf(definition, index.definitions)
  }
  return vsPointsIndex(vsDataDefinitions(found.construction), ids, found.entry.base ? null : found.entry.edition.id, name)
}

/**
 * A rules version's own construction file, read from the snapshot `directory` is, or is under for a rules version, where
 * `reads` takes that version; null otherwise and where the snapshot has none.
 */
function constructionIn(
  directory: string,
  editionId: string | undefined,
  reads: (entry: CatalogueComposition['editions'][number]) => boolean,
): { entry: CatalogueComposition['editions'][number]; construction: VsDataConstruction } | null {
  const root = editionId && path.basename(path.dirname(directory)) === 'editions' ? path.resolve(directory, '..', '..') : directory
  const entry = readCatalogueComposition(root)?.editions.find((candidate) =>
    editionId ? candidate.edition.id === editionId : candidate.base,
  )
  if (!entry || !reads(entry)) return null
  const file = path.join(root, 'summaries', `${entry.base ? (entry.summaries ?? entry.edition.id) : entry.edition.id}.construction.json`)
  if (!fs.existsSync(file)) return null
  return { entry, construction: vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))) }
}

/** What VS Data's checker reads of a roster beyond its units' wargear: everything but options, wargear and points. */
const ROSTER_KINDS = ['faction', 'battle-size', 'detachment', 'enhancement', 'unit', 'model', 'allegiance']

/** The current rules version's roster definitions, as VS Data's checker reads a list whose wargear the catalogue builds. */
export function vsRosterDefinitionsIn(directory: string, index: CatalogueIndex, editionId?: string): VsRosterData | null {
  // Only the current rules version's lists are checked by VS Data so far.
  const construction = constructionIn(directory, editionId, (entry) => entry.base)?.construction
  if (!construction) return null
  const strip = (kind: string, data: Record<string, unknown>) => {
    if (kind === 'model')
      return { unit: data.unit, min: data.min, max: data.max, ...(data.bySize ? { bySize: data.bySize } : {}), wargear: {} }
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
  return vsRosterData(pruned, ids, null, (entryId) => {
    const definition = index.definitions.get(entryId)
    return definition && nameOf(definition, index.definitions)
  })
}
