import type { ChangeSource } from '../src/core/catalogueChanges'
import { compileCanonicalCatalogueFromSnapshot, snapshotRules } from '../src/server/canonicalCatalogue'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from '../src/server/canonicalCatalogueSources'
import { loadCatalogue } from '../src/server/catalogueIndex'
import type { SnapshotSourceName } from '../src/server/catalogueSources'

const priced = ({ name, points }: { name: string; points: number | null }) => ({ name, points })

/** Only what the diff reads, so a compiled catalogue costs little to hold or to pass between processes. */
const changeSource = (catalogue: ChangeSource): ChangeSource => ({
  datasheets: catalogue.datasheets.map(({ catalogueId, faction, id, name, points, costs }) => ({
    catalogueId,
    faction,
    id,
    name,
    points,
    costs,
  })),
  detachments: catalogue.detachments.map(({ catalogueId, faction, id, name, points, enhancements, upgrades }) => ({
    catalogueId,
    faction,
    id,
    name,
    points,
    enhancements: enhancements.map(priced),
    upgrades: upgrades.map(priced),
  })),
})

/**
 * A catalogue directory's reference data, compiled from its sources with today's code.
 *
 * Any compiled catalogue the directory packages is ignored: two publishes compiled by
 * different compiler versions would otherwise differ where the data does not. A directory
 * missing a source the compile reads is refused, because its part would compile empty.
 */
export function compiledChangeSource(directory: string, sources: readonly SnapshotSourceName[]): ChangeSource | null {
  const missing = CANONICAL_CATALOGUE_SOURCE_NAMES.filter((name) => !sources.includes(name))
  if (missing.length) throw new Error(`it carries no ${missing.join(', ')}`)
  const catalogue = loadCatalogue(directory)
  return catalogue ? changeSource(compileCanonicalCatalogueFromSnapshot(catalogue, snapshotRules(directory, catalogue), directory)) : null
}
