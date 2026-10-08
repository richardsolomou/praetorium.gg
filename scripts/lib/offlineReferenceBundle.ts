import path from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'
import { loadCatalogue, isReferenceDatasheet } from '../../src/server/catalogueIndex'
import { loadRules } from '../../src/server/rules'
import { referenceCatalogue } from '../../src/server/canonicalCatalogue'
import { factionsFor, factionIndexFor, detachmentsOffering } from '../../src/server/factionReferences'
import { unitsIn } from '../../src/server/cataloguePicker'
import { detachmentReference } from '../../src/server/detachmentReference'
import { referenceDatasheetBySlug, referenceRuleIndex, referenceRuleSection } from '../../src/server/referenceCatalogue'
import { gameReferencesFor } from '../../src/server/gameReferences'
import { compiledGlobalSearchIndex } from '../../src/server/globalSearch'
import { terrainMatchupIds, TERRAIN_GEOMETRY_VERSION } from '../../src/contracts/terrainReference'
import { MAX_OFFLINE_BYTES, MAX_OFFLINE_QUERIES, type OfflineReferenceBundle } from '../../src/contracts/offlineReference'

export function encodeReferenceBundle(content: Pick<OfflineReferenceBundle, 'queries' | 'search'>) {
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
  const canonical = referenceCatalogue(
    directory,
    () => catalogue,
    () => rules,
  )
  if (!canonical) throw new Error('Offline reference canonical catalogue is unavailable')
  const sources = { catalogue: () => catalogue, rules: () => rules, canonicalCatalogue: () => canonical }
  const queries: OfflineReferenceBundle['queries'] = []
  const put = (key: readonly unknown[], data: unknown) => {
    if (data == null) throw new Error(`Offline reference is incomplete: ${key.join('/')}`)
    queries.push({ key, data })
  }
  const factions = factionsFor(catalogue, rules).factions.map((faction) => ({
    ...faction,
    icon: rules.factionIcons.get(faction.slug) ?? null,
  }))
  const index = factionIndexFor(catalogue, rules)
  put(['faction-index'], {
    ...index,
    factions: index.factions.map((faction) => ({ ...faction, icon: rules.factionIcons.get(faction.slug) ?? null })),
  })
  for (const faction of factions) {
    put(['faction', faction.id], faction)
    put(['faction', faction.slug], faction)
    const units = unitsIn(catalogue, faction.id, '', { factionCards: true }).filter((unit) =>
      isReferenceDatasheet(catalogue, faction.id, unit.id),
    )
    put(['faction-datasheets', faction.id, ''], units)
    for (const unit of units)
      put(['datasheet-slug', faction.id, unit.slug], referenceDatasheetBySlug(sources, { catalogueId: faction.id, slug: unit.slug }))
    for (const detachment of faction.detachments)
      if (detachment.referenceRoute?.catalogueId === faction.slug)
        put(['detachment-detail', faction.id, detachment.slug], detachmentReference(catalogue, rules, faction.id, detachment.slug))
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
  const { revision, compressed } = encodeReferenceBundle({ queries, search: compiledGlobalSearchIndex(catalogue, rules) })
  const bundle = `/assets/reference-${revision}.bin`
  await writeFile(path.join(outDir, bundle), compressed)
  await writeFile(path.join(outDir, 'offline-reference-version.json'), JSON.stringify({ revision, bundle }))
}
