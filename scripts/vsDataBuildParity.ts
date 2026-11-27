/**
 * Report-only: every datasheet of the current rules version that VS Data defines exactly, built both ways and priced as
 * a list holding it alone. From its BSData default against VS Data's first fielding with the frozen options map's
 * `base`, from VS Data's first fielding alone, and from each choice the map gives against the BSData pick holding it:
 * the price, the model count and each kind's, the wargear by name and count (through the reviewed spellings) and the
 * keywords. Counts and datasheet IDs only.
 *
 *   pnpm exec tsx scripts/vsDataBuildParity.ts [catalogue directory] [--list] [--limit N] [--only VS unit ID]
 */
import path from 'node:path'
import { parseArgs } from 'node:util'
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { modelFixedCount } from '../src/core/modelKinds'
import type { RosterPick, VsPick } from '../src/core/roster'
import { buildUnit } from '../src/core/roster'
import type { Counts } from '../src/core/vsDataConstruction'
import { modelBounds, type VsRosterUnit } from '../src/core/vsDataRoster'
import { vsFirstFielding, vsUnitProblems, vsWithChoice } from '../src/core/vsDataUnit'
import { calculateRosterPrice } from '../src/shared/pricing'
import { vsDefinitionsOf, vsUnitIdOf } from '../src/shared/vsDataBuild'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { same } from './lib/vsDataModelNames'
import { ARTICLE, vsSpelling } from './lib/wargearSpellings'
import { wargearKey } from '../src/core/wargearNames'

const { values, positionals } = parseArgs({
  options: { list: { type: 'boolean', default: false }, limit: { type: 'string' }, only: { type: 'string' } },
  allowPositionals: true,
})
const directory = path.resolve(positionals[0] ?? 'catalogue-data')
const { catalogue: loaded, rules } = loadSnapshot(directory)
const definitions = vsDefinitionsOf(loaded)
if (!definitions || !loaded.vsRoster) throw new Error(`${directory} has no VS Data roster definitions`)
const map = legacyOptionsSchema.parse(rawOptions).units

type Priced = NonNullable<ReturnType<typeof calculateRosterPrice>>['units'][number]
type Facts = { points: number; models: number; kinds: string; wargear: string; keywords: string }

const differences = new Map<string, Map<string, string[]>>()
const tally: Record<string, number> = {}
const count = (key: string) => (tally[key] = (tally[key] ?? 0) + 1)
const differ = (check: string, unit: string, detail: string) => {
  const byUnit = differences.get(check) ?? new Map<string, string[]>()
  differences.set(check, byUnit)
  byUnit.set(unit, [...(byUnit.get(unit) ?? []), detail])
}

/** A catalogue whose army is the unit's faction or its parent's, and its first Detachment, to field the unit in. */
function listFor(faction: string) {
  const parent = definitions!.get('faction', faction)?.data.parent
  const books = Object.entries(loaded.vsRoster!.books)
  for (const wanted of [faction, parent]) {
    const book = books.find(([, id]) => id === wanted)?.[0]
    const catalogue = book && loaded.factions.find((candidate) => candidate.id.endsWith(book))
    const detachment = catalogue && loaded.detachments.get(catalogue.id)?.options[0]
    if (catalogue && detachment) return { catalogueId: catalogue.id, detachmentIds: [detachment.id] }
  }
  return null
}

function priced(list: { catalogueId: string; detachmentIds: string[] }, pick: RosterPick): Priced | null {
  const price = calculateRosterPrice({ ...list, disposition: null, borrowedDetachmentId: null, limit: 2000, units: [pick] }, loaded, rules)
  return price?.units[0] ?? null
}

function factsOf(unit: Priced, vsKeys: ReadonlySet<string>, vs: boolean): Facts {
  const countOf = (choiceKey: string, optionId: string) =>
    unit.choices.find((choice) => choice.key === choiceKey)?.options.find((option) => option.id === optionId)?.count ?? 0
  const kinds = new Map<string, number>()
  for (const kind of unit.models) {
    const n = kind.members.reduce(
      (total, member) => total + (member.choiceKey ? countOf(member.choiceKey, member.id) : member.baseCount),
      0,
    )
    if (n > 0) kinds.set(same(kind.name), (kinds.get(same(kind.name)) ?? 0) + n)
  }
  const wargear = new Map<string, number>()
  for (const piece of unit.wargear) {
    const key = vs ? wargearKey(piece.name).replace(ARTICLE, '') : vsSpelling(piece.name, vsKeys)
    wargear.set(key, (wargear.get(key) ?? 0) + piece.count)
  }
  const sorted = (entries: Iterable<[string, number]>) =>
    [...entries]
      .filter(([, n]) => n !== 0)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, n]) => `${n} ${key}`)
      .join(', ')
  return {
    points: unit.points,
    models: unit.size.models,
    kinds: sorted(kinds),
    wargear: sorted(wargear),
    keywords: [...new Set(unit.keywords.map((keyword) => same(keyword)))].toSorted().join(' '),
  }
}

function compare(check: string, unit: string, bsdata: Facts, vs: Facts) {
  for (const field of ['points', 'models', 'kinds', 'wargear', 'keywords'] as const) {
    // The catalogue names no kinds of model for a unit whose models it gives no choice of, as a lone character.
    if (field === 'kinds' && !bsdata.kinds) count(`${check} kinds: BSData names none`)
    else if (bsdata[field] === vs[field]) count(`${check} ${field} same`)
    else {
      count(`${check} ${field} differ`)
      differ(`${check} ${field}`, unit, `BSData ${bsdata[field]} | VS Data ${vs[field]}`)
    }
  }
}

const addCounts = (held: Readonly<Counts>, change: Readonly<Counts>) => {
  const next = { ...held }
  for (const [wargear, n] of Object.entries(change)) next[wargear] = (next[wargear] ?? 0) + n
  return next
}
const taking = (start: VsRosterUnit, selections: Record<string, Counts>) =>
  Object.entries(selections).reduce(
    (unit, [option, counts]) => vsWithChoice(definitions!, unit, option, addCounts(unit.options?.[option] ?? {}, counts)),
    start,
  )
const vsPick = (unit: VsRosterUnit): VsPick => ({ models: unit.models ?? {}, options: unit.options ?? {} })

let datasheets = 0
for (const [entryId, entry] of Object.entries(map).slice(0, values.limit ? Number(values.limit) : undefined)) {
  const unitId = vsUnitIdOf(loaded, entryId)
  if (values.only && unitId !== values.only) continue
  if (!unitId || unitId !== entry.unit || entry.base === 'unmatched') {
    count('skipped: not exact')
    continue
  }
  const unit = definitions.get('unit', unitId)!
  const list = listFor(unit.data.faction)
  if (!list) {
    count('skipped: no army fields it')
    continue
  }
  const bsdataDefault = priced(list, { entryId })
  if (!bsdataDefault) {
    count('skipped: BSData builds none')
    continue
  }
  datasheets++
  const vsKeys = new Set(definitions.all('wargear').map((wargear) => wargearKey(wargear.name).replace(ARTICLE, '')))
  const bsFacts = factsOf(bsdataDefault, vsKeys, false)

  const first = vsFirstFielding(definitions, unitId)
  const firstPriced = priced(list, { entryId, vs: vsPick(first) })
  if (firstPriced) compare('first fielding', unitId, bsFacts, factsOf(firstPriced, vsKeys, true))

  // The map's `base` turns VS Data's bare first fielding, its defaults alone, into BSData's.
  const smallest = Math.min(...unit.data.sizes)
  const models = Object.fromEntries(
    definitions.modelsOf(unitId).map((model) => [model.id, unit.data.defaultModels?.[model.id] ?? modelBounds(model.data, smallest).min]),
  )
  const start = taking({ unit: unitId, models, options: structuredClone(unit.data.defaults ?? {}) }, entry.base?.options ?? {})
  const startPriced = priced(list, { entryId, vs: vsPick(start) })
  if (startPriced) compare('default', unitId, bsFacts, factsOf(startPriced, vsKeys, true))
  if (vsUnitProblems(definitions, start).length) count('default: VS Data refuses the mapped base')

  /** The BSData pick holding one more of `optionId` in the group `choiceKey`, as the map reads a key; null where it can't. */
  const withKey = (pick: RosterPick | null, [choiceKey, optionId]: readonly [string, string]): RosterPick | null => {
    if (!pick) return null
    const context = { primaryCatalogueId: list.catalogueId, spreads: pick.spreads }
    const held = buildUnit(entryId, loaded.index, undefined, pick.choices, context)?.choices.find((c) => c.key === choiceKey)
    if (!held || !held.options.some((option) => option.id === optionId)) return null
    if (held.room === 1) return { ...pick, choices: { ...pick.choices, [choiceKey]: optionId } }
    const counts = Object.fromEntries(held.options.map((option) => [option.id, option.count]))
    const full = held.options.reduce((total, option) => total + option.count, 0) >= held.room
    const donor = held.options.filter((option) => option.id !== optionId && option.count > 0).toSorted((a, b) => b.count - a.count)[0]
    if (full && !donor) return null
    if (full) counts[donor!.id]!--
    counts[optionId] = (counts[optionId] ?? 0) + 1
    return { ...pick, spreads: { ...pick.spreads, [choiceKey]: counts } }
  }
  for (const [key, choice] of Object.entries(entry.choices)) {
    if (!('options' in choice) || !Object.keys(choice.options).length) continue
    const [choiceKey, optionId] = key.split('|') as [string, string]
    // A choice beneath another is read with that one taken: each group/option pair its key passes through.
    const path = choiceKey.split('/')
    const parents = path.flatMap((_, at) =>
      at % 2 === 0 && at + 1 < path.length ? [[path.slice(0, at + 1).join('/'), path[at + 1]!] as const] : [],
    )
    const parentSelections = parents.map(([group, option]) => {
      const mapped = entry.choices[`${group}|${option}`]
      return mapped && 'options' in mapped ? mapped.options : {}
    })
    const pick = [...parents, [choiceKey, optionId] as const].reduce<RosterPick | null>(withKey, { entryId })
    if (!pick) {
      count('mapped choice: closed or full at first fielding')
      continue
    }
    const bsdata = priced(list, pick)
    const vs = priced(list, { entryId, vs: vsPick([...parentSelections, choice.options].reduce(taking, start)) })
    if (!bsdata || !vs) {
      count('mapped choice: unbuilt')
      continue
    }
    count('mapped choices')
    compare('mapped choice', `${unitId} ${key}`, factsOf(bsdata, vsKeys, false), factsOf(vs, vsKeys, true))
  }
}

console.log(`${datasheets} datasheets`)
for (const [key, n] of Object.entries(tally).toSorted(([a], [b]) => a.localeCompare(b))) console.log(`  ${key}: ${n}`)
if (values.list)
  for (const [check, byUnit] of differences) {
    console.log(`\n${check}: ${byUnit.size}`)
    for (const [unit, details] of byUnit) console.log(`  ${unit}: ${details.slice(0, 2).join(' || ')}`)
  }
