import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { frozenUnits } from '../src/core/rosterSnapshot'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { unitBattleDetailsIn } from '../src/shared/catalogue'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { savedLists } from './lib/vsDataRosterParity'

/**
 * Report-only, the battles gate: what every saved roster, battle list and sealed entry in a local production copy
 * (`scripts/fetchProductionCopy.ts`) freezes into a battle, on its own rules version: each unit's models, model lines,
 * wargear, attachment and transport capacity as `frozenUnits` gives them, written to `--out` keyed by a hash of the list's
 * kind and ID so the file names no list. Run it on a base checkout and on a branch from the same copy, then pass the
 * base's file as `--against` to the branch's run: it prints how many lists freeze the same units, and how many change
 * each field. Delete the copy and both files afterwards.
 *
 *   pnpm exec tsx scripts/frozenUnitsParity.ts [catalogue directory] [list copy] --out data-dev/frozen-units.json [--against file]
 */
const { values, positionals } = parseArgs({
  options: { out: { type: 'string', default: 'data-dev/frozen-units.json' }, against: { type: 'string' } },
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

const FIELDS = ['models', 'modelLines', 'wargear', 'attachedTo', 'transportCapacity'] as const
type Frozen = Record<string, Record<(typeof FIELDS)[number] | 'entryId', unknown>[] | null>

const frozen: Frozen = {}
for (const saved of await savedLists(listFile)) {
  const key = createHash('sha256').update(`${saved.kind}:${saved.id}`).digest('hex').slice(0, 16)
  const loaded = editions.catalogueFor(saved.catalogueId)
  const priced = loaded && calculateRosterPrice(savedRosterPriceInput(saved), loaded, editions.rulesFor(saved.catalogueId))
  const details = loaded ? unitBattleDetailsIn(loaded, saved.catalogueId, saved.picks.map((pick) => pick.entryId)) : []
  frozen[key] = priced
    ? frozenUnits(saved.picks, priced.units, details).map(({ entryId, models, modelLines, wargear, attachedTo, transportCapacity }) => ({
        entryId,
        models,
        modelLines,
        wargear,
        attachedTo,
        transportCapacity,
      }))
    : null
}
fs.mkdirSync(path.dirname(path.resolve(values.out)), { recursive: true })
fs.writeFileSync(values.out, JSON.stringify(frozen), { mode: 0o600 })

if (values.against) {
  const before = JSON.parse(fs.readFileSync(values.against, 'utf8')) as Frozen
  const counts: Record<string, number> = { lists: 0, same: 0, built: 0, unbuilt: 0, ...Object.fromEntries(FIELDS.map((field) => [field, 0])) }
  for (const [key, was] of Object.entries(before)) {
    const now = frozen[key]
    if (now === undefined) continue
    counts.lists!++
    if (!was || !now) {
      if (was && !now) counts.unbuilt!++
      else if (!was && now) counts.built!++
      else counts.same!++
      continue
    }
    const changed = FIELDS.filter(
      (field) => was.length !== now.length || was.some((unit, at) => JSON.stringify(unit[field]) !== JSON.stringify(now[at]![field])),
    )
    for (const field of changed) counts[field]!++
    if (!changed.length) counts.same!++
  }
  console.log(JSON.stringify(counts))
} else console.log(`${Object.keys(frozen).length} lists frozen to ${values.out}`)
