/**
 * Report-only: what VS Data's stat lines change in the simulator. Every datasheet VS Data prints stat lines for is
 * fielded alone in its default loadout, and every tournament list `scripts/importCorpus.ts` fetches is fielded whole, each
 * measured as the roster grades measure it (against the reference targets and attackers), once with the catalogue's
 * stat lines and once with VS Data's. A target or attacker one reading calculates and the other refuses is a refusal.
 * Writes `data-dev/vs-data-profile-combat.json` with datasheet and list names, and prints counts.
 *
 *   pnpm exec tsx scripts/vsDataProfileCombat.ts [--since 2026-10-15] [--lists 200] [--datasheets 2000] [directory]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { PriceInput } from '../src/contracts/schemas'
import { resolveCombatRequest, type CombatRequest } from '../src/core/combatMatchup'
import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { namedCombatant, type CombatCatalogues } from '../src/server/combatTools'
import { referenceCorpusFor } from '../src/server/referenceCorpus'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { datasheetsOf } from '../src/shared/catalogueIndex'
import { CombatAnswerCache } from '../src/shared/combatAnswerCache'
import { currentFactionIdsOf } from '../src/shared/factionReferences'
import { gradeReferences, measureRosterUnits, referenceUnit } from '../src/shared/rosterGradeMeasures'
import { importCorpusLists } from './lib/importCorpusLists'
import { CORPUS_ROOT, SOURCES } from './lib/importCorpusSources'
import { errorText } from './lib/errorText'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { since: { type: 'string' }, lists: { type: 'string' }, datasheets: { type: 'string' }, out: { type: 'string' } },
})
const directory = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
const corpus = positionals.length ? positionals : SOURCES.map((source) => path.join(CORPUS_ROOT, source))
const { catalogue, rules, lists } = importCorpusLists(corpus, { since: values.since ?? '2026-10-15' }, directory)
process.env.CATALOGUE_DIR = directory
process.env.CATALOGUE_SNAPSHOT_ID ??= catalogue.index.revision
if (!catalogue.vsProfiles) throw new Error(`${directory} has no VS Data stat lines`)
const catalogueOnly: LoadedCatalogue = { ...catalogue, vsProfiles: undefined }

const editions = catalogueEditionLoaders(
  directory,
  () => catalogue,
  () => rules,
)
const catalogues: CombatCatalogues = {
  catalogueFor: async (id) => editions.catalogueFor(id),
  rulesFor: async (id) => editions.rulesFor(id),
  combatUnitsFor: async () => editions.combatUnits(),
  currentFactionIds: async () => currentFactionIdsOf(editions.factions()?.factions ?? []),
}
const canonical = editions.canonicalCatalogue(
  referenceCatalogue(
    directory,
    () => catalogue,
    () => rules,
  ),
)
const referenceCorpus = referenceCorpusFor({
  canonicalCatalogue: () => canonical,
  catalogue: () => catalogue,
  rules: () => rules,
  factions: editions.factions()?.factions,
})
if (!referenceCorpus) throw new Error(`No reference corpus could be built from ${directory}`)
// Both readings measure against the same reference units, so a difference is the measured unit's own.
const references = await gradeReferences(2000, (_, unit) =>
  referenceUnit(unit, (faction, name, models) => namedCombatant(faction, name, models, { corpus: referenceCorpus, catalogues })),
)
const cache = new CombatAnswerCache(512 * 1024 * 1024, 200_000)
const calculate = async (requests: CombatRequest[]) =>
  requests.map((request) => {
    const held = cache.read(request)
    if (held) return held
    const answer = resolveCombatRequest(request)
    cache.write(request, answer)
    return answer
  })

const round = (value: unknown) =>
  JSON.stringify(value, (_, entry: unknown) => (typeof entry === 'number' ? Math.round(entry * 1000) / 1000 : entry))
const counts: Record<string, Record<string, number>> = {}
const bump = (check: string, status: string) => ((counts[check] ??= {})[status] = (counts[check][status] ?? 0) + 1)
const differences: unknown[] = []

async function compare(scope: string, label: string, data: PriceInput) {
  try {
    const [today, vs] = await Promise.all(
      [catalogueOnly, catalogue].map((loaded) => measureRosterUnits({ loaded, rules, data, references, calculate })),
    )
    for (const [at, unit] of today!.entries()) {
      const other = vs![at]!
      const pairs = [
        ['damage', unit.removes, other.removes],
        ['defence', unit.volleyLoss, other.volleyLoss],
      ] as const
      for (const [check, left, right] of pairs) {
        const refused = (from: unknown, to: unknown) =>
          from !== null &&
          from !== undefined &&
          (to === null ||
            (typeof from === 'object' &&
              Object.entries(from).some(([key, value]) => value !== null && (to as Record<string, unknown>)[key] === null)))
        const status =
          round(left) === round(right) ? 'same' : refused(left, right) ? 'refuses' : refused(right, left) ? 'calculates' : 'differs'
        bump(`${scope} ${check}`, status)
        if (status !== 'same') differences.push({ scope, label, unit: unit.name, check, catalogue: left, vsData: right })
      }
    }
  } catch (error) {
    bump(scope, 'failed')
    console.error(`${label}: ${errorText(error)}`)
  }
}

const sheets = [...catalogue.index.catalogues.values()]
  .filter((book) => !book.id.includes('~'))
  .flatMap((book) => [...datasheetsOf(catalogue.index, book.id)].map((entryId) => ({ catalogueId: book.id, entryId })))
  .filter(({ entryId }, at, all) => catalogue.vsProfiles!.units[entryId] && all.findIndex((other) => other.entryId === entryId) === at)
  .slice(0, Number(values.datasheets ?? 5000))
for (const [at, { catalogueId, entryId }] of sheets.entries()) {
  await compare('datasheet', entryId, {
    catalogueId,
    detachmentIds: [],
    disposition: null,
    limit: 2000,
    units: [{ entryId }],
  })
  if ((at + 1) % 100 === 0) console.log(`${at + 1} of ${sheets.length} datasheets`)
}

const clean = lists
  .filter(({ imported }) => imported.catalogueId && imported.units.length && !imported.unknown.length && !imported.unplaced.length)
  .filter(({ imported }) => !imported.catalogueId!.includes('~'))
  .toSorted((left, right) => left.listing.list.localeCompare(right.listing.list))
  .slice(0, Number(values.lists ?? 200))
for (const [at, { listing, imported }] of clean.entries()) {
  await compare('list', listing.list, {
    catalogueId: imported.catalogueId!,
    detachmentIds: imported.detachmentIds,
    disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
    limit: 2000,
    units: imported.units,
  })
  if ((at + 1) % 25 === 0) console.log(`${at + 1} of ${clean.length} lists`)
}

const out = values.out ?? path.resolve('data-dev', 'vs-data-profile-combat.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify({ datasheets: sheets.length, lists: clean.length, counts, differences }, null, 1)}\n`)
console.log(JSON.stringify({ datasheets: sheets.length, lists: clean.length, counts }, null, 1))
console.log(`written to ${out}`)
