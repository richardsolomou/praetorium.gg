import path from 'node:path'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { loadRules } from '../src/server/rules'
import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { readCatalogueRuntime } from '../src/server/catalogueRuntime'
import type { LoadedRules } from '../src/shared/rules'
import { pickerUnitsFor } from '../src/shared/pickerUnits'

const mode = process.argv[2]
if (mode !== 'source' && mode !== 'runtime')
  throw new Error('Usage: node --expose-gc --import tsx scripts/benchmarkCatalogueLookups.ts source|runtime [snapshot] [runtime-output]')
if (!global.gc) throw new Error('Run with --expose-gc to exercise reads after garbage collection')
const directory = path.resolve(process.argv[3] ?? 'catalogue-data')
const runtime =
  mode === 'runtime' ? readCatalogueRuntime(directory, path.resolve(process.argv[4] ?? '.output/server/catalogue-runtime')) : null
let catalogue: ReturnType<typeof loadCatalogue> | undefined
let rules: LoadedRules | null | undefined
const base = () => (catalogue ??= loadCatalogue(directory))
const baseRules = () => (rules ??= loadRules(directory, undefined, undefined, undefined, base()?.datacards))
const versions = catalogueEditionLoaders(directory, base, baseRules, runtime)
const ids = readCatalogueComposition(directory)?.editions.map(({ edition }) => `${edition.id}~${edition.catalogueIds[0]!}`) ?? []
if (!ids.length) throw new Error('The benchmark needs configured rules versions')
function timed(label: string, operation: () => unknown) {
  const start = performance.now()
  const value = operation()
  console.log(JSON.stringify({ mode, label, ms: performance.now() - start }))
  return value
}
timed('ready', () => {
  versions.searchIndex()
  versions.canonicalCatalogue(runtime ? null : referenceCatalogue(directory, base, baseRules))
  versions.combatUnits()
  versions.prepare()
})
function picker(id: string) {
  const selected = versions.catalogueFor(id)!
  const units = pickerUnitsFor(selected, versions.rulesFor(id), id, '')
  if (!units.length) throw new Error(`No picker units for ${id}`)
  return units
}
for (const id of ids) {
  timed(`first-picker:${id}`, () => picker(id))
  timed(`first-reference:${id}`, () => versions.canonicalFor(id))
  const samples: number[] = []
  for (let i = 0; i < 200; i++) {
    const start = performance.now()
    picker(id)
    versions.canonicalFor(id)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  console.log(JSON.stringify({ mode, label: `warm-picker-and-reference:${id}`, medianMs: samples[100], p95Ms: samples[190] }))
}
await new Promise<void>((resolve) => setImmediate(resolve))
global.gc()
await new Promise<void>((resolve) => setImmediate(resolve))
global.gc()
for (const id of ids) {
  timed(`revisit-picker:${id}`, () => picker(id))
  timed(`revisit-reference:${id}`, () => versions.canonicalFor(id))
  await new Promise<void>((resolve) => setImmediate(resolve))
  global.gc()
}
