import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile } from '../src/core/catalogue'
import { isReferenceDatasheet, loadCatalogue } from '../src/server/catalogueIndex'
import { cataloguePartitions } from '../src/server/cataloguePartitions'
import { encodeCatalogueArtifact } from '../src/server/catalogueArtifactCodec'
import { verifyInstalledSnapshot } from '../src/server/catalogueSnapshot'
import { loadRules } from '../src/server/rules'
import { factionIndexFor, factionsFor } from '../src/server/factionReferences'
import { combatUnitsFor } from '../src/server/combatUnits'
import { loadCatalogueHistory } from '../src/server/catalogueHistory'
import { compiledGlobalSearchIndex } from '../src/server/globalSearch'
import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { referenceCorpusFor } from '../src/server/referenceCorpus'
import { referenceFactions, referenceIndex } from '../src/server/referenceService'
import { unitsIn } from '../src/server/cataloguePicker'
import type { CanonicalDatasheet, CanonicalDetachment, CanonicalCatalogueIssue } from '../src/contracts/catalogue'
import type { ReferenceDocument } from '../src/contracts/reference'

const directory = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
const output = path.resolve(process.env.WORKER_CATALOGUE_OUTPUT_DIR ?? '.output/worker-catalogue')
const pointer = verifyInstalledSnapshot(directory)
const loaded = loadCatalogue(directory)
if (!loaded) throw new Error('Verified catalogue snapshot has no definitions')
const rules = loadRules(
  path.join(directory, 'rules'),
  path.join(directory, 'battlemaster'),
  path.join(directory, 'faction-icons'),
  path.join(directory, 'datacards', '11th', 'gdc'),
  loaded.datacards,
  loaded.sourceReferences,
)
if (!rules) throw new Error('Verified catalogue snapshot has no rules')

const definitionsDirectory = path.join(directory, 'definitions')
const named = fs
  .readdirSync(definitionsDirectory)
  .filter((name) => name.endsWith('.json'))
  .toSorted()
  .map((name) => ({ name, file: JSON.parse(fs.readFileSync(path.join(definitionsDirectory, name), 'utf8')) as CatalogueFile }))
const byName = new Map(named.map((entry) => [entry.name, entry.file]))
const partitions = cataloguePartitions(named)
const entries: Record<string, { sha256: string; bytes: number }> = {}
const byFaction: Record<string, string> = {}

function write(name: string, value: unknown) {
  const bytes = Buffer.from(encodeCatalogueArtifact(value))
  const file = path.join(output, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, bytes)
  entries[name] = { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }
}

write('shared.json', {
  datacards: loaded.datacards,
  sourceReferences: loaded.sourceReferences,
  rules,
  factionIndex: factionIndexFor(loaded, rules),
  factions: factionsFor(loaded, rules),
  combatUnits: combatUnitsFor(loaded, rules),
  searchIndex: compiledGlobalSearchIndex(loaded, rules),
  referenceDatasheets: new Map(
    loaded.factions.map((faction) => [
      faction.id,
      unitsIn(loaded, faction.id, '', { factionCards: true }).filter((unit) => isReferenceDatasheet(loaded, faction.id, unit.id)),
    ]),
  ),
  history: loadCatalogueHistory(directory),
})

const canonical = referenceCatalogue(
  directory,
  () => loaded,
  () => rules,
)
if (!canonical) throw new Error('Verified catalogue snapshot has no canonical reference')
const referenceCorpus = referenceCorpusFor({ canonicalCatalogue: () => canonical, catalogue: () => loaded, rules: () => rules })
if (!referenceCorpus) throw new Error('Verified catalogue snapshot has no reference corpus')
const reference: NonNullable<typeof referenceCorpus> = referenceCorpus

type ReferenceGroup = {
  datasheets: CanonicalDatasheet[]
  detachments: CanonicalDetachment[]
  issues: CanonicalCatalogueIssue[]
  documents: ReferenceDocument[]
}
const groups = new Map<string, ReferenceGroup>()
const groupFor = (id: string) => {
  let group = groups.get(id)
  if (!group) {
    group = { datasheets: [], detachments: [], issues: [], documents: [] }
    groups.set(id, group)
  }
  return group
}
const documentFactions = new Map<string, string>()
for (const sheet of reference.catalogue.datasheets) {
  groupFor(sheet.catalogueId).datasheets.push(sheet)
  const route = sheet.referenceRoute ?? { catalogueId: sheet.catalogueId, slug: sheet.slug }
  documentFactions.set(`datasheet:${route.catalogueId}:${route.slug}`, sheet.catalogueId)
}
for (const detachment of reference.catalogue.detachments) {
  groupFor(detachment.catalogueId).detachments.push(detachment)
  documentFactions.set(`detachment:${detachment.factionSlug}:${detachment.slug}`, detachment.catalogueId)
}
for (const issue of reference.catalogue.issues) groupFor(issue.catalogueId).issues.push(issue)
const globalDocuments: ReferenceDocument[] = []
for (const document of reference.documents) {
  const faction = documentFactions.get(document.id)
  if (faction) groupFor(faction).documents.push(document)
  else globalDocuments.push(document)
}

const referenceShards: string[] = []
const factionShards: Record<string, string> = {}
const documentShards: Record<string, string> = {}
const buckets = Array.from({ length: 8 }, () => ({ ids: [] as string[], bytes: 0 }))
const weightedGroups = [...groups].map(([id, group]) => ({ id, bytes: Buffer.byteLength(JSON.stringify(group)) }))
for (const { id, bytes } of weightedGroups.toSorted((left, right) => right.bytes - left.bytes || left.id.localeCompare(right.id))) {
  const bucket = buckets.toSorted((left, right) => left.bytes - right.bytes)[0]!
  bucket.ids.push(id)
  bucket.bytes += bytes
}

function writeReferenceShard(name: string, ids: readonly string[], documents: ReferenceDocument[], ruleDocuments = false) {
  const selected = ids.map((id) => groups.get(id)!)
  write(name, {
    catalogue: {
      ...reference.catalogue,
      datasheets: selected.flatMap((group) => group.datasheets),
      detachments: selected.flatMap((group) => group.detachments),
      ruleDocuments: ruleDocuments ? reference.catalogue.ruleDocuments : [],
      issues: selected.flatMap((group) => group.issues),
    },
    documents,
    revision: reference.revision,
  })
  referenceShards.push(name)
  for (const id of ids) factionShards[id] = name
  for (const document of documents) documentShards[document.id] = name
}

const globalName = 'references/global.json'
writeReferenceShard(globalName, [], globalDocuments, true)
for (const [index, bucket] of buckets.entries()) {
  if (!bucket.ids.length) continue
  const name = `references/${index}.json`
  writeReferenceShard(
    name,
    bucket.ids,
    bucket.ids.flatMap((id) => groups.get(id)!.documents),
  )
}
const paths = new Set<string>(['/factions', '/rules'])
for (const document of reference.documents) {
  paths.add(document.url.split('#')[0]!)
  for (const section of document.sections) paths.add(section.url.split('#')[0]!)
}
for (const sheet of reference.catalogue.datasheets) {
  if (sheet.referenceRoute) paths.add(`/factions/${sheet.referenceRoute.catalogueId}`)
}
for (const detachment of reference.catalogue.detachments) paths.add(`/factions/${detachment.factionSlug}`)
for (const document of reference.catalogue.ruleDocuments) {
  paths.add(`/rules/${document.slug}`)
  for (const section of document.sections) paths.add(`/rules/${document.slug}/${section.slug}`)
}
write('reference-meta.json', {
  revision: reference.revision,
  revisions: reference.catalogue.revisions,
  index: referenceIndex(reference),
  factions: referenceFactions(reference),
  shards: referenceShards,
  factionShards,
  documentShards,
  paths: [...paths].toSorted(),
})

for (const [catalogueId, names] of partitions) {
  const files = names.map((name) => byName.get(name)!)
  const index = buildIndex(files, loaded.index.revision)
  const expected = loaded.index.datasheets.get(catalogueId) ?? new Set<string>()
  const actual = index.datasheets.get(catalogueId) ?? new Set<string>()
  if (expected.size !== actual.size || [...expected].some((id) => !actual.has(id))) {
    throw new Error(`Incomplete catalogue partition ${catalogueId}`)
  }
  const name = `partitions/${createHash('sha256').update(catalogueId).digest('hex').slice(0, 24)}.json`
  if (entries[name]) throw new Error(`Catalogue partition collision ${catalogueId}`)
  write(name, files)
  byFaction[catalogueId] = name
}

fs.writeFileSync(
  path.join(output, 'manifest.json'),
  `${JSON.stringify({ format: 'praetorium.worker-catalogue.v1', snapshotId: pointer.id, revision: loaded.index.revision, entries, partitions: byFaction })}\n`,
)
console.log(`worker catalogue: ${Object.keys(byFaction).length} partitions from ${pointer.id}`)
