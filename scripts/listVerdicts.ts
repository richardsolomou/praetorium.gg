import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { savedLists } from './lib/vsDataRosterParity'

/**
 * Report-only, the whole-list gate: every saved roster, battle list and sealed entry in a local production copy
 * (`scripts/fetchProductionCopy.ts`) priced as Praetorium prices it, its points and errors written to `--out`, keyed by a
 * hash of the list's kind and ID so the file names no list. Run it on a base checkout and on a branch, then pass the
 * base's file as `--against` to the branch's run: it prints how many lists keep their verdict, flip either way, change
 * points or change errors, and each error that comes or goes with how many lists it does so in.
 *
 *   pnpm exec tsx scripts/listVerdicts.ts [catalogue directory] [list copy] --out data-dev/list-verdicts.json [--against file]
 */
const { values, positionals } = parseArgs({
  options: { out: { type: 'string', default: 'data-dev/list-verdicts.json' }, against: { type: 'string' } },
  allowPositionals: true,
})
const directory = path.resolve(positionals[0] ?? 'catalogue-data')
const listFile = path.resolve(positionals[1] ?? 'data-dev/production-lists.ndjson.gz')
const { catalogue, rules } = loadSnapshot(directory)
const editions = catalogueEditionLoaders(
  directory,
  () => catalogue,
  () => rules,
)

type Verdict = { kind: string; edition: string; points: number; errors: string[] } | null
const verdicts: Record<string, Verdict> = {}
for (const saved of await savedLists(listFile)) {
  const key = createHash('sha256').update(`${saved.kind}:${saved.id}`).digest('hex').slice(0, 16)
  const loaded = editions.catalogueFor(saved.catalogueId)
  let price = null
  try {
    price = loaded && calculateRosterPrice(savedRosterPriceInput(saved), loaded, editions.rulesFor(saved.catalogueId))
  } catch {
    price = null
  }
  verdicts[key] = price
    ? {
        kind: saved.kind,
        edition: loaded?.edition?.id ?? 'base',
        points: price.points,
        errors: price.errors.map((error) => `${error.entryName}: ${error.message}`).toSorted((a, b) => a.localeCompare(b)),
      }
    : null
}
fs.writeFileSync(path.resolve(values.out), JSON.stringify(verdicts), { mode: 0o600 })
const priced = Object.values(verdicts).filter(Boolean).length
console.log(`${Object.keys(verdicts).length} lists, ${priced} priced, ${Object.keys(verdicts).length - priced} unpriced`)

if (values.against) {
  const before: Record<string, Verdict> = JSON.parse(fs.readFileSync(path.resolve(values.against), 'utf8'))
  const counts = new Map<string, number>()
  const count = (label: string) => counts.set(label, (counts.get(label) ?? 0) + 1)
  const gone = new Map<string, number>()
  const arrived = new Map<string, number>()
  const general = (error: string) => error.replaceAll(/\d+/g, 'N')
  for (const [key, after] of Object.entries(verdicts)) {
    const was = before[key]
    if (was === undefined) {
      count('new to this copy')
      continue
    }
    if (!was || !after) {
      count(!was && !after ? 'unpriced on both' : was ? 'priced before only' : 'priced after only')
      continue
    }
    const legal = (verdict: NonNullable<Verdict>) => verdict.errors.length === 0
    count(
      legal(was) === legal(after) ? `${legal(after) ? 'legal' : 'refused'} on both` : legal(was) ? 'legal → refused' : 'refused → legal',
    )
    if (was.points !== after.points) count('points change')
    const removed = was.errors.filter((error) => !after.errors.includes(error))
    const added = after.errors.filter((error) => !was.errors.includes(error))
    if (removed.length || added.length) count(`errors change (${after.edition})`)
    for (const error of new Set(removed.map(general))) gone.set(error, (gone.get(error) ?? 0) + 1)
    for (const error of new Set(added.map(general))) arrived.set(error, (arrived.get(error) ?? 0) + 1)
  }
  for (const [label, n] of [...counts].toSorted((a, b) => a[0].localeCompare(b[0]))) console.log(`  ${n} ${label}`)
  const listed = (title: string, errors: Map<string, number>) => {
    if (!errors.size) return
    console.log(`${title}, by lists:`)
    for (const [error, n] of [...errors].toSorted((a, b) => b[1] - a[1])) console.log(`  ${n} ${error}`)
  }
  listed('errors gone', gone)
  listed('errors new', arrived)
}
