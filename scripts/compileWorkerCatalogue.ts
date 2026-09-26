import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { buildIndex, type CatalogueFile } from '../src/core/catalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { cataloguePartitions } from '../src/server/cataloguePartitions'
import { encodeCatalogueArtifact } from '../src/server/catalogueArtifactCodec'
import { verifyInstalledSnapshot } from '../src/server/catalogueSnapshot'
import { loadRules } from '../src/server/rules'
import { factionIndexFor, factionsFor } from '../src/server/factionReferences'
import { combatUnitsFor } from '../src/server/combatUnits'
import { loadCatalogueHistory } from '../src/server/catalogueHistory'
import { compiledGlobalSearchIndex } from '../src/server/globalSearch'

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
  history: loadCatalogueHistory(directory),
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
