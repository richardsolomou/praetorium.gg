import { readFile, writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { productionRosterSnapshotSchema } from './lib/productionRosters'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { catalogueDataDirectory } from './lib/catalogueFiles'

// Prices every roster in a production snapshot the way the roster editor does, then reports timings or writes every result.
const [snapshotFile = 'data-dev/production-rosters.json', output] = process.argv.slice(2)
const directory = catalogueDataDirectory()
const { catalogue: base, rules: baseRules } = loadSnapshot(directory)
const editions = catalogueEditionLoaders(
  directory,
  () => base,
  () => baseRules,
)
const { rosters } = productionRosterSnapshotSchema.parse(JSON.parse(await readFile(snapshotFile, 'utf8')))
const inputs = rosters.map((roster) => ({ id: roster.id, input: { ...savedRosterPriceInput(roster), includeUnitLimits: true } }))
const price = ({ input }: (typeof inputs)[number]) =>
  calculateRosterPrice(input, editions.catalogueFor(input.catalogueId), editions.rulesFor(input.catalogueId))

for (const roster of inputs) price(roster)
if (output) {
  await writeFile(output, JSON.stringify(Object.fromEntries(inputs.map((roster) => [roster.id, price(roster)]))))
  console.log(`Wrote ${inputs.length} prices to ${output}`)
} else {
  const samples = inputs.map((roster) => {
    const start = performance.now()
    price(roster)
    return { units: roster.input.units.length, ms: performance.now() - start }
  })
  const sorted = samples.map(({ ms }) => ms).toSorted((left, right) => left - right)
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))]!.toFixed(1)
  const total = sorted.reduce((sum, ms) => sum + ms, 0)
  console.log(`rosters=${samples.length} total_ms=${total.toFixed(0)} median_ms=${at(0.5)} p95_ms=${at(0.95)} max_ms=${at(1)}`)
}
