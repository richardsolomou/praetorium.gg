import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { pickerUnitsFor } from '../src/shared/pickerUnits'
import { benchmarkEditions } from './lib/catalogueSnapshotLoad'

const { gc, mode, directory, runtime, base, baseRules, versions } = benchmarkEditions(
  'Usage: node --expose-gc --import tsx scripts/benchmarkCatalogueLookups.ts source|runtime [snapshot] [runtime-output]',
)
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
gc()
await new Promise<void>((resolve) => setImmediate(resolve))
gc()
for (const id of ids) {
  timed(`revisit-picker:${id}`, () => picker(id))
  timed(`revisit-reference:${id}`, () => versions.canonicalFor(id))
  await new Promise<void>((resolve) => setImmediate(resolve))
  gc()
}
