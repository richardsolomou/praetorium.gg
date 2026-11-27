import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import rawBooks from '../catalogue/legacy-ids/books.json' with { type: 'json' }
import rawDetachments from '../catalogue/legacy-ids/detachments.json' with { type: 'json' }
import rawEnhancements from '../catalogue/legacy-ids/enhancements.json' with { type: 'json' }
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import rawUnits from '../catalogue/legacy-ids/units.json' with { type: 'json' }
import { nameOf } from '../src/core/catalogue'
import { legacyIdsSchema, legacyOptionsSchema } from '../src/core/legacyIds'
import { buildUnit, type RosterPick, type VsPick } from '../src/core/roster'
import { type Counts, vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { modelBounds } from '../src/core/vsDataRoster'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { datasheetsOf } from '../src/shared/catalogueIndex'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { vsRosterData } from '../src/shared/vsDataLegality'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

/**
 * Report-only: for each datasheet the current rules version's VS Data defines exactly, the unit BSData builds by
 * default and with each choice the frozen options map (`catalogue/legacy-ids/options.json`) translates, priced as a
 * one-unit list twice: once as the BSData pick, checked by the catalogue, and once as the same unit by VS Data IDs (its
 * first fielding, the map's `base` and the choice's selections), checked by VS Data. Prints how often the two verdicts
 * agree and, with `--list`, each disagreement with both sides' errors. Catalogue data only, no lists.
 *
 *   pnpm exec tsx scripts/vsDataLegalityParity.ts [catalogue directory] [--list]
 */
const { values, positionals } = parseArgs({ options: { list: { type: 'boolean', default: false } }, allowPositionals: true })
const directory = path.resolve(positionals[0] ?? 'catalogue-data')
const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const construction = vsDataConstructionSchema.parse(
  JSON.parse(fs.readFileSync(path.join(directory, 'summaries', `${base.edition.id}.construction.json`), 'utf8')),
)
const definitions = vsDataDefinitions(construction)
const { catalogue, rules } = loadSnapshot(directory)
const editions = catalogueEditionLoaders(
  directory,
  () => catalogue,
  () => rules,
)
// The checker reads a VS pick's models and wargear, so it gets the whole construction, not the copy without wargear.
const ids = { books: rawBooks, detachments: rawDetachments, units: rawUnits, enhancements: rawEnhancements }
const vsRoster = vsRosterData(
  construction,
  Object.fromEntries(Object.entries(ids).map(([kind, raw]) => [kind, legacyIdsSchema.parse(raw).ids])) as never,
  null,
  (entryId) => {
    const definition = catalogue.index.definitions.get(entryId)
    return definition && nameOf(definition, catalogue.index.definitions)
  },
)
const map = legacyOptionsSchema.parse(rawOptions).units

type Case = { entryId: string; unit: string; key: string; book: string; bs: RosterPick; vs: VsPick }
type Verdict = 'both legal' | 'both refuse' | 'BSData alone refuses' | 'VS Data alone refuses' | 'not built'
const verdicts = new Map<Verdict, Case[]>()
const details: string[] = []

const sum = (counts: Counts) => Object.values(counts).reduce((total, n) => total + n, 0)
const added = (into: Record<string, Counts>, change: Record<string, Counts>) => {
  const next = structuredClone(into)
  for (const [option, counts] of Object.entries(change))
    for (const [wargear, n] of Object.entries(counts)) {
      const held = (next[option] ??= {})
      held[wargear] = (held[wargear] ?? 0) + n
      if (held[wargear] === 0) delete held[wargear]
      if (!Object.keys(held).length) delete next[option]
    }
  return next
}

/** The book the datasheet belongs to: the one VS Data files its unit under, else the first offering it. */
function bookOf(entryId: string, unit: string) {
  const faction = definitions.get('unit', unit)?.data.faction
  const offering = catalogue.factions.filter((book) => datasheetsOf(catalogue.index, book.id).has(entryId)).map((book) => book.id)
  return offering.find((book) => vsRoster.books[book] === faction) ?? offering[0]
}

function errorsOf(book: string, pick: RosterPick) {
  const loaded = editions.catalogueFor(book)
  if (!loaded) return null
  const detachment = loaded.detachments.get(book)?.options[0]?.id
  const input = savedRosterPriceInput({
    catalogueId: book,
    detachmentIds: detachment ? [detachment] : [],
    disposition: null,
    limit: 2000,
    picks: [pick],
  })
  const price = calculateRosterPrice(input, { ...loaded, vsRoster }, editions.rulesFor(book))
  return price && price.errors.map((error) => `${error.entryName}: ${error.message}`).toSorted()
}

let datasheets = 0
for (const [entryId, entry] of Object.entries(map)) {
  const unit = definitions.get('unit', entry.unit)
  if (!unit || entry.base === 'unmatched' || vsRoster.units[entryId] !== unit.id) continue
  const book = bookOf(entryId, unit.id)
  if (!book) continue
  datasheets++
  const smallest = Math.min(...unit.data.sizes)
  const models = Object.fromEntries(
    definitions.modelsOf(unit.id).map((model) => [model.id, unit.data.defaultModels?.[model.id] ?? modelBounds(model.data, smallest).min]),
  )
  const first = added(structuredClone(unit.data.defaults ?? {}), entry.base?.options ?? {})
  const built = buildUnit(entryId, catalogue.index)
  const cases: Case[] = [{ entryId, unit: unit.id, key: 'default', book, bs: { entryId }, vs: { models, options: first } }]
  for (const [key, choice] of Object.entries(entry.choices)) {
    const [choiceKey, optionId = ''] = key.split('|') as [string, string?]
    const held = built?.choices.find((candidate) => candidate.key === choiceKey)
    if (!held || !optionId) continue
    const vs: VsPick =
      'allegiance' in choice ? { models, options: first, allegiance: choice.allegiance } : { models, options: added(first, choice.options) }
    let bs: RosterPick = { entryId, choices: { [choiceKey]: optionId } }
    if (held.room > 1) {
      // A divided group takes one more of the option, and one fewer of the most held other where it is full.
      const counts = Object.fromEntries(held.options.map((option) => [option.id, option.count]))
      counts[optionId] = (counts[optionId] ?? 0) + 1
      if (sum(counts) > held.room) {
        const donor = held.options.filter((option) => option.id !== optionId && option.count > 0).toSorted((a, b) => b.count - a.count)[0]
        if (!donor) continue
        counts[donor.id]! -= 1
      }
      bs = { entryId, spreads: { [choiceKey]: counts } }
    }
    cases.push({ entryId, unit: unit.id, key, book, bs, vs })
  }
  for (const found of cases) {
    const bsErrors = errorsOf(found.book, found.bs)
    const vsErrors = errorsOf(found.book, { entryId, vs: found.vs })
    const verdict: Verdict =
      !bsErrors || !vsErrors
        ? 'not built'
        : bsErrors.length && vsErrors.length
          ? 'both refuse'
          : bsErrors.length
            ? 'BSData alone refuses'
            : vsErrors.length
              ? 'VS Data alone refuses'
              : 'both legal'
    verdicts.set(verdict, [...(verdicts.get(verdict) ?? []), found])
    const differ = JSON.stringify(bsErrors) !== JSON.stringify(vsErrors)
    if (values.list && differ && verdict !== 'both legal')
      details.push(
        `${verdict} · ${found.unit} ${found.key}\n    BSData: ${bsErrors?.join(' | ') || '-'}\n    VS Data: ${vsErrors?.join(' | ') || '-'}`,
      )
  }
}

console.log(`${base.edition.id}: ${datasheets} datasheets, ${[...verdicts.values()].reduce((total, list) => total + list.length, 0)} units`)
for (const [verdict, list] of verdicts) console.log(`  ${verdict}: ${list.length}`)
for (const line of details) console.log(line)
