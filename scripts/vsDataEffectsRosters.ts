/**
 * What VS Data's effect blocks change for real lists, against what Praetorium reads from rule wording today: each
 * tournament list `scripts/importCorpus.ts` fetches is measured as the roster grades measure it (every unit against the
 * reference targets and attackers, with its default buffs), and its reminders and Order allowances are read, once with
 * today's facts and once with VS Data's. Report only.
 *
 *   pnpm exec tsx scripts/vsDataEffectsRosters.ts [--since 2026-10-15] [--limit 200] [--out <file>] [directory]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { PriceInput } from '../src/contracts/schemas'
import { resolveCombatRequest, type CombatRequest } from '../src/core/combatMatchup'
import { rosterGrades } from '../src/core/rosterGrades'
import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { namedCombatant, type CombatCatalogues } from '../src/server/combatTools'
import { serverWords } from '../src/server/publishedTextFiles'
import { referenceCorpusFor } from '../src/server/referenceCorpus'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { CombatAnswerCache } from '../src/shared/combatAnswerCache'
import { currentFactionIdsOf } from '../src/shared/factionReferences'
import { datasheetIn } from '../src/shared/catalogue'
import { describeDatasheetAbilities } from '../src/shared/datasheetDescriptions'
import { gradeReferences, measureRosterUnits, referenceUnit, type RuleWords } from '../src/shared/rosterGradeMeasures'
import { datasheetCombatant } from '../src/shared/rosterCombatRules'
import { importCorpusLists } from './lib/importCorpusLists'
import { CORPUS_ROOT, SOURCES } from './lib/importCorpusSources'
import { errorText } from './lib/errorText'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { since: { type: 'string' }, limit: { type: 'string' }, out: { type: 'string' } },
})
const directory = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
const corpus = positionals.length ? positionals : SOURCES.map((source) => path.join(CORPUS_ROOT, source))
const { catalogue, rules, lists } = importCorpusLists(corpus, { since: values.since ?? '2026-10-15' }, directory)
process.env.CATALOGUE_DIR = directory
process.env.CATALOGUE_SNAPSHOT_ID ??= catalogue.index.revision

// The catalogue reads VS Data's facts; today's reading is the facts it keeps of the words beside them, which the server
// may also read the words of.
const vsCatalogue = catalogue
const wordCatalogue: LoadedCatalogue = {
  ...catalogue,
  index: { ...catalogue.index, textFacts: { get: (key) => catalogue.definitions!.fact(key) ?? catalogue.datacards.textFacts?.get(key) } },
}
const noWords: RuleWords = () => null

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
// Both readings measure against the same reference units, so a difference is the list's own.
const references = await gradeReferences(2000, (_, unit) =>
  referenceUnit(unit, (faction, name, models) => namedCombatant(faction, name, models, { corpus: referenceCorpus, catalogues })),
)
const words = await serverWords()
const cache = new CombatAnswerCache(512 * 1024 * 1024, 200_000)
const calculate = async (requests: CombatRequest[]) =>
  requests.map((request) => {
    const held = cache.read(request)
    if (held) return held
    const answer = resolveCombatRequest(request)
    cache.write(request, answer)
    return answer
  })

const clean = lists
  .filter(({ imported }) => imported.catalogueId && imported.units.length && !imported.unknown.length && !imported.unplaced.length)
  .filter(({ imported }) => !imported.catalogueId!.includes('~'))
  .toSorted((left, right) => left.listing.list.localeCompare(right.listing.list))
  .slice(0, Number(values.limit ?? 200))

const round = (value: number | null | undefined) => (value === null || value === undefined ? null : Math.round(value * 1000) / 1000)
const counts: Record<string, Record<string, number>> = {}
const bump = (check: string, status: string) => ((counts[check] ??= {})[status] = (counts[check][status] ?? 0) + 1)
const differences: unknown[] = []

for (const [index, { listing, imported }] of clean.entries()) {
  const data: PriceInput = {
    catalogueId: imported.catalogueId!,
    detachmentIds: imported.detachmentIds,
    disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
    limit: 2000,
    units: imported.units,
  }
  const book = catalogue.index.catalogues.get(data.catalogueId)
  try {
    const [today, vs] = await Promise.all(
      [
        [wordCatalogue, words],
        [vsCatalogue, noWords],
      ].map(([loaded, read]) =>
        measureRosterUnits({ loaded: loaded as LoadedCatalogue, rules, data, words: read as RuleWords, references, calculate }),
      ),
    )
    for (const [at, unit] of today!.entries()) {
      const other = vs![at]!
      for (const [check, left, right] of [
        ['damage', unit.removes, other.removes],
        ['defence', round(unit.volleyLoss), round(other.volleyLoss)],
        ['unitGeneration', unit.unitGeneration, other.unitGeneration],
        ['movementTools', unit.movementTools, other.movementTools],
      ] as const) {
        const normal = (value: unknown) =>
          JSON.stringify(value, (_, entry: unknown) => (typeof entry === 'number' ? Math.round(entry * 1000) / 1000 : entry))
        const refused =
          check === 'damage' &&
          Object.entries(unit.removes).some(
            ([key, removes]) => removes !== null && other.removes[key as keyof typeof other.removes] === null,
          )
        const status = normal(left) === normal(right) ? 'same' : refused ? 'refuses' : 'differs'
        bump(check, status)
        if (status !== 'same') differences.push({ list: listing.list, unit: unit.name, check, today: left, vs: right })
      }
    }
    const grades = [today!, vs!].map((units) => rosterGrades(units, data.limit, book?.name ?? ''))
    const rows = grades.map((graded) => JSON.stringify([graded.grade, graded.categories, graded.missing, graded.units]))
    bump('grades', rows[0] === rows[1] ? 'same' : 'differs')
    if (rows[0] !== rows[1]) differences.push({ list: listing.list, check: 'grades', today: rows[0], vs: rows[1] })
    // What each pick's datasheet shows a reminder for, and the Order allowances its combatant reads.
    for (const [pickIndex, pick] of data.units.entries()) {
      const read = (loaded: LoadedCatalogue) => {
        const sheet = describeDatasheetAbilities(loaded, data.catalogueId, datasheetIn(loaded, data.catalogueId, pick.entryId), rules)
        const combatant = datasheetCombatant(loaded, rules, {
          catalogueId: data.catalogueId,
          entryId: pick.entryId,
          detachmentIds: data.detachmentIds,
          picks: data.units,
          pickIndex,
          everyWeapon: false,
        } as never)
        return {
          reminders: JSON.stringify((sheet?.abilities ?? []).map((ability) => [ability.name, ability.reminder ?? null])),
          allowances: JSON.stringify(combatant?.battleChoiceAllowances ?? []),
        }
      }
      const [left, right] = [read(wordCatalogue), read(vsCatalogue)]
      for (const check of ['reminders', 'allowances'] as const) {
        const status = left[check] === right[check] ? 'same' : 'differs'
        bump(check, status)
        if (status !== 'same') differences.push({ list: listing.list, entryId: pick.entryId, check, today: left[check], vs: right[check] })
      }
    }
  } catch (error) {
    bump('lists', 'failed')
    console.error(`${listing.list}: ${errorText(error)}`)
  }
  if ((index + 1) % 25 === 0) console.log(`${index + 1} of ${clean.length} lists`)
}

const out = values.out ?? path.resolve('data-dev', 'vs-data-effects-rosters.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify({ lists: clean.length, counts, differences }, null, 1)}\n`)
console.log(JSON.stringify({ lists: clean.length, counts }, null, 1))
console.log(`written to ${out}`)
