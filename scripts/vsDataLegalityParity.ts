import path from 'node:path'
import { parseArgs } from 'node:util'
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import { nameOf } from '../src/core/catalogue'
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { isNonMatchedPlayName } from '../src/core/name'
import { buildUnit, type RosterPick } from '../src/core/roster'
import type { Counts } from '../src/core/vsDataConstruction'
import { modelBounds } from '../src/core/vsDataRoster'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { datasheetsOf } from '../src/shared/catalogueIndex'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { vsDefinitionsOf, vsUnitIdOf } from '../src/shared/vsDataBuild'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

/**
 * Report-only: for each datasheet the current rules version's VS Data defines exactly, the unit BSData builds by
 * default and with each choice the frozen options map (`catalogue/legacy-ids/options.json`) translates, priced as a
 * one-unit list twice: once as the BSData pick, checked by the catalogue, and once as the same unit by VS Data IDs (its
 * first fielding, the map's `base` and the choices it holds), built and checked by VS Data. Prints how often the two verdicts
 * agree and, with `--list`, each disagreement with both sides' errors. Catalogue data only, no lists.
 *
 *   pnpm exec tsx scripts/vsDataLegalityParity.ts [catalogue directory] [--list]
 */
const { values, positionals } = parseArgs({ options: { list: { type: 'boolean', default: false } }, allowPositionals: true })
const directory = path.resolve(positionals[0] ?? 'catalogue-data')
const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const { catalogue, rules } = loadSnapshot(directory)
const editions = catalogueEditionLoaders(
  directory,
  () => catalogue,
  () => rules,
)
const present = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) throw new Error(`${directory} has no VS Data roster definitions for ${base.edition.id}`)
  return value
}
const definitions = present(vsDefinitionsOf(catalogue))
const vsRoster = present(catalogue.vsRoster)
const map = legacyOptionsSchema.parse(rawOptions).units

type Verdict = 'same' | 'both refuse, differently' | 'BSData alone refuses' | 'VS Data alone refuses'
const verdicts = new Map<Verdict, number>()
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

function errorsOf(book: string, detachment: string | undefined, pick: RosterPick) {
  const loaded = editions.catalogueFor(book)
  if (!loaded) return null
  const input = savedRosterPriceInput({
    catalogueId: book,
    detachmentIds: detachment ? [detachment] : [],
    disposition: null,
    limit: 2000,
    picks: [pick],
  })
  const price = calculateRosterPrice(input, loaded, editions.rulesFor(book))
  return price && new Set(price.errors.map((error) => `${error.entryName}: ${error.message}`))
}

const UNAVAILABLE = 'a saved choice is no longer available'
const unavailable = (errors: Set<string> | null) => !errors || [...errors].some((error) => error.includes(UNAVAILABLE))

/**
 * A pick's VS Data translation as the frozen map's reader makes it: VS Data's first fielding, `base`, then each key the
 * pick holds (one for a divided group's one extra), with any allegiance the default build holds kept. Null where the map
 * has no entry for one of them.
 */
function translated(entry: (typeof map)[string], first: Record<string, Counts>, allegiance: string | undefined, keys: readonly string[]) {
  let options = first
  let taken = allegiance
  for (const key of keys) {
    const choice = entry.choices[key]
    if (!choice) return null
    if ('allegiance' in choice) taken = choice.allegiance
    else options = added(options, choice.options)
  }
  return { options, ...(taken ? { allegiance: taken } : {}) }
}

const keysOf = (choices: Record<string, string>) => Object.entries(choices).map(([key, option]) => `${key}|${option}`)
const differences = new Map<string, number>()
let datasheets = 0
let unbuilt = 0
for (const [entryId, entry] of Object.entries(map)) {
  // A book key's unit is read in that book's lists, never the list of the unit's own faction this builds.
  if (entryId.includes('/')) continue
  const unit = definitions.get('unit', entry.unit)
  if (!unit || entry.base === 'unmatched' || vsUnitIdOf(catalogue, '', entryId) !== unit.id) continue
  // Only a datasheet VS Data defines exactly is fielded by its IDs, so Legends and Crucible copies stay out.
  const name = nameOf(catalogue.index.definitions.get(entryId)!, catalogue.index.definitions)
  if (unit.data.legends || isNonMatchedPlayName(name)) continue
  const book = bookOf(entryId, unit.id)
  if (!book) continue
  datasheets++
  const smallest = Math.min(...unit.data.sizes)
  const models = Object.fromEntries(
    definitions.modelsOf(unit.id).map((model) => [model.id, unit.data.defaultModels?.[model.id] ?? modelBounds(model.data, smallest).min]),
  )
  const first = added(structuredClone(unit.data.defaults ?? {}), entry.base?.options ?? {})
  const built = buildUnit(entryId, catalogue.index)
  // The allegiance the default build holds, or the one its datasheet's name gives, as a Nurgle Soul Grinder's.
  const allegiance =
    built?.choices.flatMap((choice) => {
      const mapped = choice.chosen ? entry.choices[`${choice.key}|${choice.chosen}`] : undefined
      return mapped && 'allegiance' in mapped ? [mapped.allegiance] : []
    })[0] ??
    (unit.data.allegiances ?? [])
      .flatMap((offer) => offer.choices)
      .find((id) =>
        name
          .toLowerCase()
          .split(/\s+/)
          .includes((definitions.get('allegiance', id)?.name ?? '').toLowerCase()),
      )
  const picks: { key: string; bs: RosterPick; keys: string[] }[] = [{ key: 'default', bs: { entryId }, keys: [] }]
  for (const key of Object.keys(entry.choices)) {
    const [choiceKey, optionId = ''] = key.split('|') as [string, string?]
    const held = built?.choices.find((candidate) => candidate.key === choiceKey)
    if (!held || !optionId) continue
    // A choice beneath another is made with that one taken: the option each step of its key names.
    const parents = Object.fromEntries(
      choiceKey
        .split('/')
        .slice(0, -1)
        .flatMap((step) => {
          const parent = built?.choices.find((candidate) => candidate.options.some((option) => option.id === step))
          return parent ? [[parent.key, step]] : []
        }),
    )
    if (held.room > 1) {
      // A divided group takes one more of the option, and one fewer of the most held other where it is full.
      const counts = Object.fromEntries(held.options.map((option) => [option.id, option.count]))
      counts[optionId] = (counts[optionId] ?? 0) + 1
      if (sum(counts) > held.room) {
        const donor = held.options.filter((option) => option.id !== optionId && option.count > 0).toSorted((a, b) => b.count - a.count)[0]
        if (!donor) continue
        counts[donor.id]! -= 1
      }
      picks.push({ key, bs: { entryId, choices: parents, spreads: { [choiceKey]: counts } }, keys: [...keysOf(parents), key] })
    } else picks.push({ key, bs: { entryId, choices: { ...parents, [choiceKey]: optionId } }, keys: [...keysOf(parents), key] })
  }
  const detachments =
    editions
      .catalogueFor(book)
      ?.detachments.get(book)
      ?.options.map((option) => option.id) ?? []
  for (const { key, bs, keys } of picks) {
    const read = translated(entry, first, allegiance, keys)
    // The first of the book's Detachments that offers what the pick holds.
    let detachment = detachments[0]
    let bsErrors = errorsOf(book, detachment, bs)
    for (const other of detachments.slice(1)) {
      if (!unavailable(bsErrors)) break
      const retried = errorsOf(book, other, bs)
      if (!unavailable(retried)) [detachment, bsErrors] = [other, retried]
    }
    if (!read || unavailable(bsErrors)) {
      unbuilt++
      continue
    }
    const vsErrors = errorsOf(book, detachment, { entryId, vs: { models, ...read } })!
    const bsOnly = [...bsErrors!].filter((error) => !vsErrors.has(error))
    const vsOnly = [...vsErrors].filter((error) => !bsErrors!.has(error))
    const verdict: Verdict =
      !bsOnly.length && !vsOnly.length
        ? 'same'
        : bsErrors!.size && vsErrors.size
          ? 'both refuse, differently'
          : bsErrors!.size
            ? 'BSData alone refuses'
            : 'VS Data alone refuses'
    verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1)
    const general = (error: string) => error.replace(/^[^:]*: /, '').replaceAll(/\d+/g, 'N')
    for (const error of bsOnly) differences.set(`BSData: ${general(error)}`, (differences.get(`BSData: ${general(error)}`) ?? 0) + 1)
    for (const error of vsOnly) differences.set(`VS Data: ${general(error)}`, (differences.get(`VS Data: ${general(error)}`) ?? 0) + 1)
    if (values.list && verdict !== 'same')
      details.push(
        `${verdict} · ${unit.id} ${key}\n    BSData only: ${bsOnly.join(' | ') || '-'}\n    VS Data only: ${vsOnly.join(' | ') || '-'}`,
      )
  }
}

const compared = [...verdicts.values()].reduce((total, n) => total + n, 0)
console.log(`${base.edition.id}: ${datasheets} datasheets, ${compared} units compared, ${unbuilt} the catalogue or the map cannot build`)
for (const [verdict, n] of verdicts) console.log(`  ${verdict}: ${n}`)
console.log('errors one side alone raises:')
for (const [error, n] of [...differences].toSorted((a, b) => b[1] - a[1])) console.log(`  ${n} ${error}`)
for (const line of details) console.log(line)
