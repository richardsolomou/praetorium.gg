import { hash } from 'node:crypto'
import path from 'node:path'
import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { readCatalogueRuntime } from '../src/server/catalogueRuntime'
import { loadRules } from '../src/server/rules'
import { packRuntimeData } from '../src/contracts/runtimeData'
import { unitsIn } from '../src/shared/cataloguePicker'
import { pickerUnitsFor } from '../src/shared/pickerUnits'
import type { LoadedRules } from '../src/shared/rules'
import { catalogueDataDirectory } from './lib/catalogueFiles'

const mode = process.argv[2]
if (mode !== 'source' && mode !== 'runtime') {
  throw new Error(
    'Usage: node --expose-gc --import tsx scripts/benchmarkCatalogueMemory.ts source|runtime [snapshot] [runtime-output] [--verify]',
  )
}
if (!global.gc) throw new Error('Run with --expose-gc so measurements follow garbage collection')
const gc = global.gc
const directory = path.resolve(process.argv[3] ?? catalogueDataDirectory())
const runtime =
  mode === 'runtime' ? readCatalogueRuntime(directory, path.resolve(process.argv[4] ?? '.output/server/catalogue-runtime')) : null
// The base catalogue loads lazily so runtime mode measures only what the compiled runtime reads.
let baseCatalogue: ReturnType<typeof loadCatalogue> | undefined
let baseLoadedRules: LoadedRules | null | undefined
const base = () => (baseCatalogue ??= loadCatalogue(directory))
const baseRules = () => (baseLoadedRules ??= loadRules(directory, { loadedDatacards: base()?.datacards }))
const versions = catalogueEditionLoaders(directory, base, baseRules, runtime)
const started = performance.now()

async function report(stage: string) {
  await new Promise<void>((resolve) => setImmediate(resolve))
  gc()
  await new Promise<void>((resolve) => setImmediate(resolve))
  gc()
  console.log(JSON.stringify({ mode, stage, elapsedMs: Math.round(performance.now() - started), ...process.memoryUsage() }))
}

function digest(stage: string, value: unknown) {
  console.log(
    JSON.stringify({
      mode,
      projection: stage,
      sha256: hash('sha256', JSON.stringify(packRuntimeData(value))),
    }),
  )
}

await report('baseline')
const primary = runtime ? null : referenceCatalogue(directory, base, baseRules)
const canonical = versions.canonicalCatalogue(primary)
const search = versions.searchIndex()
const combat = versions.combatUnits()
const factions = versions.factions()
versions.prepare()
await report('ready')
if (process.argv.includes('--verify')) {
  digest('canonical', canonical)
  digest('search', search)
  digest('combat', combat)
  digest('factions', factions)
}
const original = base()
const originalRules = baseRules()
if (original) for (const faction of original.factions) pickerUnitsFor(original, originalRules, faction.id, '')
await report('base construction')
for (let cycle = 0; cycle < 2; cycle++) {
  for (const { edition } of readCatalogueComposition(directory)?.editions ?? []) {
    const id = `${edition.id}~${edition.catalogueIds[0]!}`
    const selected = versions.catalogueFor(id)!
    const selectedRules = versions.rulesFor(id)
    for (const bookId of edition.catalogueIds) pickerUnitsFor(selected, selectedRules, `${edition.id}~${bookId}`, '')
    if (cycle === 0 && process.argv.includes('--verify')) {
      digest(`${edition.id}:canonical`, versions.canonicalFor(id))
      digest(`${edition.id}:rules`, selectedRules)
      for (const book of selected.factions) {
        digest(`${edition.id}:${book.id}:units`, unitsIn(selected, book.id, ''))
      }
    }
    await report(`${cycle}:${edition.id}`)
  }
}
await report('settled')
