import type { ChangeSource } from '../../src/core/catalogueChanges'
import { compileCanonicalCatalogueFromSnapshot, snapshotRules } from '../../src/server/canonicalCatalogue'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from '../../src/server/canonicalCatalogueSources'
import { datasheetsOf, loadCatalogue } from '../../src/server/catalogueIndex'
import type { SnapshotSourceName } from '../../src/server/catalogueSources'
import path from 'node:path'
import { readCatalogueComposition } from '../../src/server/catalogueComposition'
import { type CatalogueEdition, editionLabel } from '../../src/core/catalogueEdition'

const priced = ({ name, points }: { name: string; points: number | null }) => ({ name, points })

/** Only what the diff reads, so a compiled catalogue costs little to hold or to pass between processes. */
const changeSource = (catalogue: ChangeSource, datasheetOffers: NonNullable<ChangeSource['datasheetOffers']>): ChangeSource => ({
  datasheets: catalogue.datasheets.map(({ catalogueId, faction, id, name, points, costs }) => ({
    catalogueId,
    faction,
    id,
    name,
    points,
    costs,
  })),
  datasheetOffers,
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
  const primary = compiledEditionChangeSource(directory, sources)
  if (!primary) return null
  const editions = readCatalogueComposition(directory)?.editions ?? []
  for (const { edition } of editions) {
    const source = compiledEditionChangeSource(path.join(directory, 'editions', edition.id), sources, edition)
    if (!source) throw new Error(`edition ${edition.id} cannot be compiled for history`)
    primary.datasheets = [...primary.datasheets, ...source.datasheets]
    primary.detachments = [...primary.detachments, ...source.detachments]
    primary.datasheetOffers = [...(primary.datasheetOffers ?? []), ...(source.datasheetOffers ?? [])]
  }
  return primary
}

function compiledEditionChangeSource(
  directory: string,
  sources: readonly SnapshotSourceName[],
  edition?: CatalogueEdition,
): ChangeSource | null {
  const missing = CANONICAL_CATALOGUE_SOURCE_NAMES.filter((name) => !sources.includes(name))
  if (missing.length) throw new Error(`it carries no ${missing.join(', ')}`)
  const catalogue = loadCatalogue(directory, edition)
  if (!catalogue) return null
  const canonical = compileCanonicalCatalogueFromSnapshot(catalogue, snapshotRules(directory, catalogue), directory)
  const publishedIds = new Set(canonical.datasheets.map((sheet) => sheet.id))
  const offers = catalogue.factions.flatMap((faction) =>
    [...datasheetsOf(catalogue.index, faction.id)].filter((id) => publishedIds.has(id)).map((id) => ({ catalogueId: faction.id, id })),
  )
  const source = changeSource(canonical, offers)
  if (!edition) return source
  const ids = new Set(edition.catalogueIds.map((id) => `${edition.id}~${id}`))
  return {
    datasheets: source.datasheets
      .filter((sheet) => ids.has(sheet.catalogueId))
      .map((sheet) => ({ ...sheet, faction: `${sheet.faction} · ${editionLabel(edition)}` })),
    detachments: source.detachments
      .filter((detachment) => ids.has(detachment.catalogueId))
      .map((detachment) => ({ ...detachment, faction: `${detachment.faction} · ${editionLabel(edition)}` })),
    datasheetOffers: source.datasheetOffers?.filter((offer) => ids.has(offer.catalogueId)),
  }
}
