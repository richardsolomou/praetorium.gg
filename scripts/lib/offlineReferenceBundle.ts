import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'
import { readdirSync, readFileSync } from 'node:fs'
import type { CatalogueFile } from '../../src/core/catalogue'
import { packRuntimeData } from '../../src/contracts/runtimeData'
import { loadCatalogue, isReferenceDatasheet } from '../../src/server/catalogueIndex'
import { loadRules } from '../../src/server/rules'
import { referenceCatalogue } from '../../src/server/canonicalCatalogue'
import { detachmentsOffering } from '../../src/shared/factionReferences'
import { unitsIn } from '../../src/shared/cataloguePicker'
import { detachmentReference } from '../../src/shared/detachmentReference'
import { referenceDatasheetBySlug, referenceRuleIndex, referenceRuleSection } from '../../src/server/referenceCatalogue'
import { gameReferencesFor } from '../../src/shared/gameReferences'
import { readCatalogueComposition } from '../../src/server/catalogueComposition'
import { editionCatalogueId } from '../../src/core/catalogueEdition'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import { routeSlug } from '../../src/core/slug'
import { terrainMatchupIds, TERRAIN_GEOMETRY_VERSION } from '../../src/contracts/terrainReference'
import { MAX_OFFLINE_BYTES, MAX_OFFLINE_QUERIES, type OfflineReferenceBundle } from '../../src/contracts/offlineReference'

export function encodeReferenceBundle(content: Pick<OfflineReferenceBundle, 'queries' | 'search' | 'construction'>) {
  if (content.queries.length > MAX_OFFLINE_QUERIES) throw new Error('Offline reference has too many entries')
  const revision = createHash('sha256').update(JSON.stringify(content)).digest('hex')
  const json = Buffer.from(JSON.stringify({ version: 1, revision, ...content }))
  if (json.length > MAX_OFFLINE_BYTES) throw new Error('Offline reference is too large')
  const compressed = gzipSync(json)
  if (compressed.length > 10_000_000) throw new Error('Compressed reference exceeds the web asset limit')
  return { revision, compressed }
}

export async function writeReferenceBundle(outDir: string, directory = process.env.CATALOGUE_DIR ?? path.resolve('catalogue-data')) {
  const catalogue = loadCatalogue(directory)
  if (!catalogue) throw new Error('Offline reference catalogue is unavailable')
  const rules = loadRules(directory, undefined, undefined, undefined, catalogue.datacards)
  if (!rules) throw new Error('Offline reference rules are unavailable')
  const versions = catalogueEditionLoaders(
    directory,
    () => catalogue,
    () => rules,
  )
  const canonical = versions.canonicalCatalogue(
    referenceCatalogue(
      directory,
      () => catalogue,
      () => rules,
    ),
  )
  if (!canonical) throw new Error('Offline reference canonical catalogue is unavailable')
  const sources = { catalogue: () => catalogue, rules: () => rules, canonicalCatalogue: () => canonical }
  const queries: OfflineReferenceBundle['queries'] = []
  const put = (key: readonly unknown[], data: unknown) => {
    if (data == null) throw new Error(`Offline reference is incomplete: ${key.join('/')}`)
    queries.push({ key, data })
  }
  const versioned = versions.factions()!
  const factions = versioned.factions.map((faction) => ({
    ...faction,
    icon: rules.factionIcons.get(routeSlug(faction.displayName)) ?? null,
  }))
  put(['faction-index'], {
    revision: versioned.revision,
    factions,
  })
  const referenceFactions = [...factions]
  const queued = new Set(factions.map((faction) => faction.id))
  const queueReference = (catalogueId: string) => {
    const faction = versions.factionFor(catalogueId)
    if (!faction || queued.has(faction.id)) return
    queued.add(faction.id)
    referenceFactions.push({ ...faction, icon: rules.factionIcons.get(routeSlug(faction.displayName)) ?? null })
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
    const units = unitsIn(selectedCatalogue, faction.id, '', { factionCards: true }).filter((unit) =>
      isReferenceDatasheet(selectedCatalogue, faction.id, unit.id),
    )
    put(['faction-datasheets', faction.id, ''], units)
    for (const unit of units) {
      const sheet = referenceDatasheetBySlug(selectedSources, { catalogueId: faction.id, slug: unit.slug })
      put(['datasheet-slug', faction.id, unit.slug], sheet)
      for (const relationship of [...(sheet?.attachments ?? []), ...(sheet?.leaders ?? []), ...(sheet?.supporters ?? [])])
        if (relationship.route) queueReference(relationship.route.catalogueId)
    }
    for (const detachment of faction.detachments) {
      if (detachment.referenceRoute) queueReference(detachment.referenceRoute.catalogueId)
      if (detachment.referenceRoute?.catalogueId === faction.slug)
        put(
          ['detachment-detail', faction.id, detachment.slug],
          detachmentReference(selectedCatalogue, selectedRules, faction.id, detachment.slug),
        )
    }
  }
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
    files: readdirSync(path.join(target, 'definitions'))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name): CatalogueFile => JSON.parse(readFileSync(path.join(target, 'definitions', name), 'utf8'))),
    datacards: packRuntimeData(selectedCatalogue.datacards),
    mfm: packRuntimeData(selectedCatalogue.mfm ?? null),
    rules: packRuntimeData(selectedRules),
  })
  const construction = {
    ...constructionFor(directory, catalogue, rules),
    editions: (readCatalogueComposition(directory)?.editions ?? []).map(({ edition }) => {
      const id = editionCatalogueId(edition.id, edition.catalogueIds[0]!)
      const selectedCatalogue = versions.catalogueFor(id)
      const selectedRules = versions.rulesFor(id)
      if (!selectedCatalogue || !selectedRules) throw new Error(`Offline construction data is unavailable for ${id}`)
      return constructionFor(path.join(directory, 'editions', edition.id), selectedCatalogue, selectedRules)
    }),
  }
  const { revision, compressed } = encodeReferenceBundle({ queries, search: versions.searchIndex()!, construction })
  const bundle = `/assets/reference-${revision}.bin`
  await writeFile(path.join(outDir, bundle), compressed)
  await writeFile(path.join(outDir, 'offline-reference-version.json'), JSON.stringify({ revision, bundle }))
}
