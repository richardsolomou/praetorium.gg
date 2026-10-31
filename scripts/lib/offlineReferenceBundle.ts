import path from 'node:path'
import { textSourceFiles } from '../../src/server/sourceTexts'
import { hash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import type { CatalogueFile } from '../../src/core/catalogue'
import { packRuntimeData, type RuntimeData } from '../../src/contracts/runtimeData'
import { shareRuntimeData } from '../../src/contracts/sharedRuntimeData'
import { referenceCatalogue } from '../../src/server/canonicalCatalogue'
import { detachmentsOffering } from '../../src/shared/factionReferences'
import {
  publishedDetachmentReference,
  publishedFaction,
  referenceDatasheetBySlug,
  referenceFactionDatasheets,
  referenceRuleIndex,
  referenceRuleSection,
} from '../../src/server/referenceCatalogue'
import { gameReferencesFor } from '../../src/shared/gameReferences'
import { readCatalogueComposition } from '../../src/server/catalogueComposition'
import { editionCatalogueId, type CatalogueEdition } from '../../src/core/catalogueEdition'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import { routeSlug } from '../../src/core/slug'
import { groupBy } from '../../src/core/collections'
import { terrainMatchupIds, TERRAIN_GEOMETRY_VERSION } from '../../src/contracts/terrainReference'
import { loadCatalogueHistory } from '../../src/server/catalogueHistory'
import { recentReferenceChanges } from '../../src/server/catalogueChangeLog'
import { loadSnapshotWithRules } from './catalogueSnapshotLoad'
import {
  encodeReferencePart,
  MAX_CONSTRUCTION_PART_BYTES,
  MAX_REFERENCE_PART_BYTES,
  referencePart,
  type OfflineConstructionBase,
  type OfflineConstructionSource,
  type OfflineReferenceVersion,
  type ReferenceQuery,
} from '../../src/contracts/offlineReference'
import { catalogueDataDirectory } from './catalogueFiles'
import type { CatalogueRuntime } from '../../src/server/catalogueRuntime'

export function constructionFilesForEdition(files: CatalogueFile[], edition?: CatalogueEdition): CatalogueFile[] {
  if (!edition) return files
  const byId = new Map(files.map((file) => [(file.catalogue ?? file.gameSystem)!.id, file]))
  const required = new Set(edition.catalogueIds)
  for (const id of required) {
    const file = byId.get(id)
    if (!file) throw new Error(`Offline construction is missing catalogue ${id}`)
    if (file.catalogue?.gameSystemId) required.add(file.catalogue.gameSystemId)
    for (const link of file.catalogue?.catalogueLinks ?? []) required.add(link.targetId)
  }
  return files.filter((file) => required.has((file.catalogue ?? file.gameSystem)!.id))
}

/** Gzips one part of the offline download, named by its content, refusing one a device should not decode at once. */
export function encodeOfflinePart(value: unknown, limit = MAX_REFERENCE_PART_BYTES) {
  const json = Buffer.from(encodeReferencePart(value))
  if (json.length > limit) throw new Error(`An offline part exceeds its size limit (${json.length} of ${limit} bytes)`)
  const compressed = gzipSync(json, { level: 9 })
  // Gzip's OS byte varies by build platform; deployed assets use the Unix marker.
  compressed[9] = 3
  return { revision: hash('sha256', json), compressed }
}

/** An edition's construction data with what it shares with the current rules replaced by references to it. */
export function sharedEdition(source: OfflineConstructionSource, base: OfflineConstructionSource): OfflineConstructionSource {
  const ids = base.files.map((file) => (file.catalogue ?? file.gameSystem)!.id)
  return {
    ...source,
    files: source.files.map((file) => {
      const index = ids.indexOf((file.catalogue ?? file.gameSystem)!.id)
      return (
        index < 0 ? file : shareRuntimeData(file as unknown as RuntimeData, base.files[index] as unknown as RuntimeData, [String(index)])
      ) as CatalogueFile
    }),
    datacards: shareRuntimeData(source.datacards, base.datacards),
    mfm: shareRuntimeData(source.mfm, base.mfm),
    rules: shareRuntimeData(source.rules, base.rules),
  }
}

export async function writeReferenceBundle(outDir: string, directory = catalogueDataDirectory(), runtime?: CatalogueRuntime) {
  const { catalogue, rules } = loadSnapshotWithRules(directory)
  const versions = catalogueEditionLoaders(
    directory,
    () => catalogue,
    () => rules,
    runtime ?? null,
  )
  const canonical = versions.canonicalCatalogue(
    runtime
      ? null
      : referenceCatalogue(
          directory,
          () => catalogue,
          () => rules,
        ),
  )
  if (!canonical) throw new Error('Offline reference canonical catalogue is unavailable')
  const sources = { catalogue: () => catalogue, rules: () => rules, canonicalCatalogue: () => canonical }
  const history = loadCatalogueHistory(directory) ?? []
  const historyCanonical = (slug: string) => versions.pageCanonical(slug, versions.canonicalFor(slug), () => canonical)
  const queries: ReferenceQuery[] = []
  const put = (key: readonly unknown[], data: unknown) => {
    if (data == null) throw new Error(`Offline reference is incomplete: ${key.join('/')}`)
    queries.push({ key, data })
  }
  const versioned = versions.factions()!
  const factions = versioned.factions.map((faction) => ({
    ...publishedFaction(faction, versions.catalogueFor(faction.id)),
    icon: rules.factionIcons.get(routeSlug(faction.displayName)) ?? null,
  }))
  put(['faction-index'], {
    revision: versioned.revision,
    factions,
  })
  put(['combat-units'], versions.combatUnits())
  const referenceFactions = [...factions]
  const queued = new Set(factions.map((faction) => faction.id))
  const queueReference = (catalogueId: string) => {
    const faction = versions.factionFor(catalogueId)
    if (!faction || queued.has(faction.id)) return
    queued.add(faction.id)
    referenceFactions.push({
      ...publishedFaction(faction, versions.catalogueFor(faction.id)),
      icon: rules.factionIcons.get(routeSlug(faction.displayName)) ?? null,
    })
  }
  for (const faction of referenceFactions) {
    const selectedCatalogue = versions.catalogueFor(faction.id)!
    const selectedRules = versions.rulesFor(faction.id)
    if (!selectedRules) throw new Error(`Offline reference rules are unavailable for ${faction.id}`)
    const selectedCanonical = versions.canonicalFor(faction.id) ?? canonical
    const selectedSources = { catalogue: () => selectedCatalogue, rules: () => selectedRules, canonicalCatalogue: () => selectedCanonical }
    put(['faction', faction.id], faction)
    put(['faction', faction.slug], faction)
    if (faction.isDefault) put(['faction', routeSlug(faction.displayName)], faction)
    const units = await referenceFactionDatasheets(selectedCatalogue, { catalogueId: faction.id, query: '' })
    put(['faction-datasheets', faction.id, ''], units)
    for (const unit of units) {
      const sheet = referenceDatasheetBySlug(selectedSources, { catalogueId: faction.id, slug: unit.slug })
      put(['datasheet-slug', faction.id, unit.slug], sheet)
      const changes = { kind: 'datasheet' as const, faction: faction.slug, slug: sheet?.slug ?? unit.slug }
      put(
        ['reference-changes', changes.kind, changes.faction, changes.slug],
        recentReferenceChanges(history, historyCanonical(faction.slug), changes),
      )
      for (const relationship of [...(sheet?.attachments ?? []), ...(sheet?.leaders ?? []), ...(sheet?.supporters ?? [])])
        if (relationship.route) queueReference(relationship.route.catalogueId)
    }
    for (const detachment of faction.detachments) {
      if (detachment.referenceRoute) queueReference(detachment.referenceRoute.catalogueId)
      if (detachment.referenceRoute?.catalogueId === faction.slug)
        put(
          ['detachment-detail', faction.id, detachment.slug],
          publishedDetachmentReference(selectedCatalogue, selectedRules, faction.id, detachment.slug),
        )
    }
  }
  put(['text-sources'], textSourceFiles(directory, readCatalogueComposition(directory)))
  const ruleIndex = referenceRuleIndex(sources)
  put(['rule-index'], ruleIndex)
  for (const document of ruleIndex!.documents)
    for (const section of document.sections)
      put(
        ['rule-section', document.slug, section.slug],
        referenceRuleSection(sources, { documentId: document.slug, sectionId: section.slug }),
      )
  const references = gameReferencesFor(rules)
  put(['game-references'], references)
  for (const disposition of references.dispositions)
    put(['disposition-detachments', disposition.id], detachmentsOffering(factions, disposition.id))
  const matchups = new Map<string, string[]>()
  for (const pack of references.packs)
    for (const mission of pack.missions)
      for (const pair of mission.matchups) {
        if (!pair[0] || !pair[1]) continue
        const ids = terrainMatchupIds([pair[0].id, pair[1].id])
        matchups.set(JSON.stringify(ids), ids)
      }
  for (const ids of matchups.values())
    put(['terrain-references', TERRAIN_GEOMETRY_VERSION, ...ids], {
      layouts: rules.terrainLayouts.filter((layout) => ids.includes(layout.matchupId)),
      templates: rules.terrainTemplates,
    })
  put(['deployments'], rules.deployments)
  const constructionFor = (target: string, selectedCatalogue: typeof catalogue, selectedRules: typeof rules) => ({
    version: 1 as const,
    revision: selectedCatalogue.index.revision,
    ...(selectedCatalogue.edition ? { edition: selectedCatalogue.edition } : {}),
    ...(selectedCatalogue.datacardExcludedCatalogueIds
      ? {
          datacardExcludedCatalogueIds: [...selectedCatalogue.datacardExcludedCatalogueIds].map((id) => id.split('~').at(-1)!),
        }
      : {}),
    files: constructionFilesForEdition(
      readdirSync(path.join(target, 'definitions'))
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map((name): CatalogueFile => JSON.parse(readFileSync(path.join(target, 'definitions', name), 'utf8'))),
      selectedCatalogue.edition,
    ),
    datacards: packRuntimeData(selectedCatalogue.datacards),
    mfm: packRuntimeData(selectedCatalogue.mfm ?? null),
    rules: packRuntimeData({ ...selectedRules, terrainLayouts: [], terrainTemplates: [] }),
  })
  const write = async (kind: 'reference' | 'construction', value: unknown, limit?: number) => {
    const part = encodeOfflinePart(value, limit)
    const asset = `/assets/${kind}-${part.revision}.bin`
    await writeFile(path.join(outDir, 'assets', path.basename(asset)), part.compressed)
    return asset
  }
  const grouped = groupBy(queries, (query) => referencePart(query.key))
  const parts: Record<string, string> = {}
  for (const [name, entries] of grouped) if (name) parts[name] = await write('reference', entries)
  const reference = {
    core: await write('reference', grouped.get(null) ?? []),
    search: await write('reference', versions.searchIndex()!),
    parts,
  }
  const base = constructionFor(directory, catalogue, rules)
  const { rules: baseRules, ...baseCatalogue } = base
  const baseEditions: OfflineConstructionBase[] = []
  const editions: Record<string, string> = {}
  for (const { edition, base: current } of readCatalogueComposition(directory)?.editions ?? []) {
    const id = editionCatalogueId(edition.id, edition.catalogueIds[0]!)
    const selectedCatalogue = versions.catalogueFor(id)
    const selectedRules = versions.rulesFor(id)
    if (!selectedCatalogue || !selectedRules) throw new Error(`Offline construction data is unavailable for ${id}`)
    if (current) baseEditions.push({ base: true, version: 1, edition, revision: selectedCatalogue.index.revision })
    else
      editions[edition.id] = await write(
        'construction',
        sharedEdition(constructionFor(path.join(directory, 'editions', edition.id), selectedCatalogue, selectedRules), base),
        MAX_CONSTRUCTION_PART_BYTES,
      )
  }
  const construction = {
    catalogue: await write('construction', { ...baseCatalogue, editions: baseEditions }, MAX_CONSTRUCTION_PART_BYTES),
    rules: await write('construction', { revision: base.revision, rules: baseRules }),
    editions,
  }
  const manifest: OfflineReferenceVersion = {
    revision: hash('sha256', JSON.stringify({ reference, construction })),
    reference,
    construction,
  }
  await writeFile(path.join(outDir, 'offline-reference-version.json'), JSON.stringify(manifest))
}
