import fs from 'node:fs'
import path from 'node:path'
import { battleSizeSelection } from '../src/core/evaluate'
import { buildUnit } from '../src/core/roster'
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { wargearOf } from '../src/core/wargear'
import { wargearKey } from '../src/core/wargearNames'
import { type Counts, vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { checkVsUnit, type VsRosterUnit } from '../src/core/vsDataRoster'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { rosterDetachments } from '../src/shared/rosterDetachments'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { savedLists } from './lib/vsDataRosterParity'
import { leaves, legacyIds, modelsByName, same, specialOf, vsModels } from './lib/vsDataRosters'
import { vsSpelling } from './lib/wargearSpellings'

/**
 * Report-only: every pick of every list in a local production copy (`scripts/fetchProductionCopy.ts`, or a
 * `just rosters-fetch` snapshot) on the current rules version, translated whole into VS Data. The unit Praetorium builds
 * today is matched by the fewest VS Data option selections, in a fixed tie order, whose unit has the same models and
 * the same wargear (through the reviewed spellings) and that VS Data's checker accepts at the pick's size. Each pick is
 * `translated`, `ambiguous` (equally few valid selections disagree) or `unmatched`, with a reason. The per-choice map
 * (`catalogue/legacy-ids/options.json`) is only a guess to compare against. Writes
 * `data-dev/saved-pick-translations.ndjson`, which names lists by ID, so it stays in `data-dev`, and prints counts.
 *
 *   pnpm exec tsx scripts/translateSavedPicks.ts [catalogue directory] [list copy]
 */
const directory = path.resolve(process.argv[2] ?? 'catalogue-data')
const listFile = path.resolve(
  process.argv[3] ??
    (fs.existsSync('data-dev/production-lists.ndjson.gz') ? 'data-dev/production-lists.ndjson.gz' : 'data-dev/production-rosters.json'),
)
const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const definitions = vsDataDefinitions(
  vsDataConstructionSchema.parse(
    JSON.parse(fs.readFileSync(path.join(directory, 'summaries', `${base.edition.id}.construction.json`), 'utf8')),
  ),
)
const { catalogue, rules } = loadSnapshot(directory)
const editions = catalogueEditionLoaders(
  directory,
  () => catalogue,
  () => rules,
)
const ids = legacyIds()
const map = legacyOptionsSchema.parse(
  JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../catalogue/legacy-ids/options.json'), 'utf8')),
).units

type Bag = Map<string, number>
type Selections = Record<string, Counts>
type Move = { option: string; choice: string; sign: number; most: number; change: Bag }
type Outcome = { outcome: 'translated' | 'ambiguous' | 'unmatched'; reason: string; selections?: Selections }

/** The most selections one connected part of a unit's wargear may take, and the search steps it may spend finding them. */
const MOST = 24
const STEPS = 400_000
/** How many equally few selections a part, and a whole unit, are told apart from before the pick counts as ambiguous. */
const KEPT = 64

const add = (bag: Bag, key: string, n: number) => {
  const next = (bag.get(key) ?? 0) + n
  if (next) bag.set(key, next)
  else bag.delete(key)
}
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const sorted = (selections: Selections) =>
  JSON.stringify(
    Object.entries(selections)
      .map(
        ([option, chosen]) =>
          [
            option,
            Object.entries(chosen)
              .filter(([, n]) => n)
              .toSorted(([a], [b]) => byId(a, b)),
          ] as const,
      )
      .filter(([, chosen]) => chosen.length)
      .toSorted(([a], [b]) => byId(a, b)),
  )
const joined = (...all: Selections[]) => {
  const into: Selections = {}
  for (const selections of all)
    for (const [option, chosen] of Object.entries(selections))
      for (const [choice, n] of Object.entries(chosen)) (into[option] ??= {})[choice] = (into[option]?.[choice] ?? 0) + n
  return into
}

/** What a VS Data unit carries with these model counts and selections, as named items. */
function vsBag(unit: string, models: Counts, selections: Selections) {
  const bag: Bag = new Map()
  for (const model of definitions.modelsOf(unit))
    for (const [id, n] of Object.entries(model.data.wargear)) leaves(definitions, id, n * (models[model.id] ?? 0), bag)
  for (const [id, n] of Object.entries(definitions.get('unit', unit)?.data.wargear ?? {})) leaves(definitions, id, n, bag)
  for (const [optionId, chosen] of Object.entries(selections)) {
    const replaces = definitions.get('roster-option', optionId)?.data.replaces ?? {}
    for (const [choice, n] of Object.entries(chosen)) {
      leaves(definitions, choice, n, bag)
      for (const [id, m] of Object.entries(replaces)) leaves(definitions, id, -m * n, bag)
    }
  }
  return bag
}

/** Each selection the unit can make, or take back from its defaults, in option, wargear and direction order. */
function movesOf(unit: string, defaults: Selections): Move[] {
  const changeOf = (optionId: string, choice: string, sign: number) => {
    const change: Bag = new Map()
    leaves(definitions, choice, sign, change)
    for (const [id, n] of Object.entries(definitions.get('roster-option', optionId)?.data.replaces ?? {}))
      leaves(definitions, id, -sign * n, change)
    return change
  }
  return [
    ...definitions
      .optionsOf(unit)
      .flatMap((option) => option.data.choices.map((choice) => ({ option: option.id, choice, sign: 1, most: Infinity }))),
    ...Object.entries(defaults).flatMap(([option, chosen]) =>
      Object.entries(chosen).flatMap(([choice, n]) => (n > 0 ? [{ option, choice, sign: -1, most: n }] : [])),
    ),
  ]
    .toSorted((a, b) => byId(a.option, b.option) || byId(a.choice, b.choice) || b.sign - a.sign)
    .map((move) => ({ ...move, change: changeOf(move.option, move.choice, move.sign) }))
    .filter(({ change }) => change.size)
}

/**
 * The fewest selections giving `target`, solved for each part of the wargear no selection connects to another, as every
 * equally few answer for each part, then a few more if those fail: null where the steps run out.
 */
function partsOf(all: readonly Move[], target: ReadonlyMap<string, number>) {
  let moves = all
  // A move that changes an item the target leaves alone, or the other way, needs another move to undo it.
  for (let before = -1; before !== moves.length;) {
    before = moves.length
    const kept = moves
    moves = kept.filter(({ change }) =>
      [...change].every(
        ([key, n]) =>
          Math.sign(target.get(key) ?? 0) === Math.sign(n) || kept.some((other) => Math.sign(other.change.get(key) ?? 0) === -Math.sign(n)),
      ),
    )
  }
  const parent = new Map<string, string>()
  const root = (item: string): string => {
    const up = parent.get(item) ?? item
    if (up === item) return item
    const top = root(up)
    parent.set(item, top)
    return top
  }
  for (const item of target.keys()) parent.set(item, item)
  for (const { change } of moves) {
    const [first, ...rest] = [...change.keys()]
    for (const item of [first!, ...rest]) if (!parent.has(item)) parent.set(item, item)
    for (const item of rest) parent.set(root(item), root(first!))
  }
  const parts = [...new Set([...target.keys()].map(root))].toSorted(byId).map((top) => ({
    target: new Map([...target].filter(([item]) => root(item) === top)),
    moves: moves.filter(({ change }) => root([...change.keys()][0]!) === top),
  }))
  return parts.map(({ target: wanted, moves: own }) => solve(own, wanted))
}

/** Every equally few multiset of `moves` giving `target`, by size from the fewest, up to two sizes; null past the steps. */
function solve(moves: readonly Move[], target: ReadonlyMap<string, number>) {
  const reach = (from: number, sign: number) => {
    const most = new Map<string, number>()
    for (const { change } of moves.slice(from))
      for (const [key, n] of change) if (Math.sign(n) === sign) most.set(key, Math.max(most.get(key) ?? 0, Math.abs(n)))
    return most
  }
  const gains = moves.map((_, at) => reach(at, 1))
  const losses = moves.map((_, at) => reach(at, -1))
  let steps = STEPS
  const found: Selections[][] = []
  for (let size = 1; size <= MOST && found.length < 2; size++) {
    const level: Selections[] = []
    const walk = (at: number, rest: Bag, left: number, counts: number[]) => {
      if (steps-- < 0 || level.length >= KEPT) return
      if (!rest.size) {
        if (left) return
        const selections: Selections = {}
        counts.forEach((n, index) => {
          if (!n) return
          const { option, choice, sign } = moves[index]!
          ;(selections[option] ??= {})[choice] = (selections[option]?.[choice] ?? 0) + sign * n
        })
        level.push(selections)
        return
      }
      if (at === moves.length || !left) return
      for (const [key, n] of rest) if (Math.abs(n) > left * ((n > 0 ? gains[at] : losses[at])!.get(key) ?? 0)) return
      const move = moves[at]!
      for (let n = Math.min(left, move.most); n >= 0; n--) {
        const next = new Map(rest)
        for (const [key, m] of move.change) add(next, key, -m * n)
        walk(at + 1, next, left - n, [...counts, n])
      }
    }
    walk(0, new Map(target), size, [])
    if (steps < 0) return null
    if (level.length || found.length) found.push(level)
  }
  return found
}

/** The pick read through the per-choice map, as the reader rule gives it: null where a key or the base is unmatched. */
function guessOf(entryId: string, pick: { choices?: Record<string, string>; spreads?: Record<string, Counts>; floor?: boolean }) {
  const entry = map[entryId]
  if (!entry || entry.base === 'unmatched') return null
  const parts: Selections[] = [entry.base?.options ?? {}]
  const keyed = (key: string, times: number) => {
    const translation = entry.choices[key]
    if (!translation) return false
    if ('options' in translation)
      parts.push(
        Object.fromEntries(
          Object.entries(translation.options).map(([option, chosen]) => [
            option,
            Object.fromEntries(Object.entries(chosen).map(([w, n]) => [w, n * times])),
          ]),
        ),
      )
    return true
  }
  const choices = {
    ...(pick.floor ? Object.fromEntries(Object.entries(entry.floor ?? {}).filter(([, value]) => typeof value === 'string')) : {}),
    ...pick.choices,
  } as Record<string, string>
  const spreads = {
    ...(pick.floor ? Object.fromEntries(Object.entries(entry.floor ?? {}).filter(([, value]) => typeof value !== 'string')) : {}),
    ...pick.spreads,
  } as Record<string, Counts>
  for (const [key, option] of Object.entries(choices)) if (!keyed(`${key}|${option}`, 1)) return null
  const first = buildUnit(entryId, catalogue.index)
  for (const [key, counts] of Object.entries(spreads)) {
    const held = first?.choices.find((choice) => choice.key === key)
    for (const [option, n] of Object.entries(counts)) {
      const times = n - (held?.options.find(({ id }) => id === option)?.count ?? 0)
      if (times && !keyed(`${key}|${option}`, times)) return null
    }
  }
  return joined(...parts)
}

const problemsOf = (read: VsRosterUnit) => {
  const found: string[] = []
  checkVsUnit(definitions, read, (code) => found.push(code))
  return found
}

const results: object[] = []
const tally: Record<string, number> = {}
const note = (key: string) => (tally[key] = (tally[key] ?? 0) + 1)
for (const saved of await savedLists(listFile)) {
  const loaded = editions.catalogueFor(saved.catalogueId)
  if (!loaded || (loaded.edition?.id ?? base.edition.id) !== base.edition.id) {
    note(`skipped: ${loaded ? 'other rules version' : 'no catalogue'}`)
    continue
  }
  const input = { ...savedRosterPriceInput(saved), includeUnitLimits: false }
  const price = calculateRosterPrice(input, loaded, editions.rulesFor(saved.catalogueId))
  if (!price) {
    note('skipped: does not price')
    continue
  }
  const roster = [
    ...[battleSizeSelection(loaded.index, input.limit)].flatMap((selection) => (selection ? [selection] : [])),
    ...rosterDetachments(loaded, input.catalogueId, input.detachmentIds).selections,
  ]
  const detachments = input.detachmentIds.flatMap((id) => (ids.detachments[id] ? [ids.detachments[id]] : []))
  for (const priced of price.units) {
    const pick = input.units[priced.key]!
    const unit = ids.units[pick.entryId]
    const translate = (): Outcome & { guess?: string } => {
      if (!unit || !definitions.get('unit', unit)) return { outcome: 'unmatched', reason: 'no-unit' }
      const built = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
        primaryCatalogueId: input.catalogueId,
        mustering: true,
        roster,
        spreads: pick.spreads,
        toggles: pick.toggles,
        floor: pick.floor,
      })
      if (!built) return { outcome: 'unmatched', reason: 'no-build' }
      const models = vsModels(definitions, unit, modelsByName(built.selection, loaded.index), priced.size.models)
      if (!models) return { outcome: 'unmatched', reason: 'models-unread' }
      const defaults = (definitions.get('unit', unit)!.data.defaults ?? {}) as Selections
      const read: VsRosterUnit = { unit, models }
      if (problemsOf({ ...read, options: defaults }).some((code) => !code.startsWith('option')))
        return { outcome: 'unmatched', reason: 'models-refused' }
      // The marks and Enhancements a unit holds are its allegiance and Enhancement, never wargear.
      const allegiances = new Map(
        (definitions.get('unit', unit)!.data.allegiances ?? []).flatMap((offer) =>
          offer.choices.map((id) => [same(definitions.get('allegiance', id)?.name ?? id), id] as const),
        ),
      )
      const taken = priced.choices.flatMap((choice) =>
        choice.options.filter((option) => option.count > 0 && allegiances.has(same(option.name))),
      )
      const specials = new Set([
        ...specialOf(priced, detachments, ids, (keys, id) => keys[id]).names,
        ...taken.map((option) => wargearKey(option.name)),
      ])
      const known = new Set(vsBag(unit, Object.fromEntries(definitions.modelsOf(unit).map((model) => [model.id, 1])), {}).keys())
      for (const option of definitions.optionsOf(unit))
        for (const choice of option.data.choices) {
          const into: Bag = new Map()
          leaves(definitions, choice, 1, into)
          for (const name of into.keys()) known.add(name)
        }
      const target: Bag = new Map()
      for (const { name, count } of wargearOf(built.selection, loaded.index))
        if (!specials.has(wargearKey(name))) add(target, vsSpelling(name, known), count)
      const delta = new Map(target)
      for (const [item, n] of vsBag(unit, models, defaults)) add(delta, item, -n)
      const valid = (selections: Selections) => !problemsOf({ ...read, options: joined(defaults, selections) }).length
      // How the per-choice map reads the pick, to compare against: equal and valid, or not.
      const guessed = guessOf(pick.entryId, pick)
      const gives = (selections: Selections) => {
        const bag = vsBag(unit, models, joined(defaults, selections))
        return bag.size === target.size && [...bag].every(([item, n]) => target.get(item) === n)
      }
      const guess = !guessed ? 'map-unmatched' : !gives(guessed) ? 'map-differs' : !valid(guessed) ? 'map-refused' : 'map-equal'
      const parts = delta.size ? partsOf(movesOf(unit, defaults), delta) : []
      if (parts.some((part) => part === null)) return { outcome: 'unmatched', reason: 'search-limit', guess }
      if (parts.some((part) => !part!.length)) {
        // Wargear no VS Data selection of the unit adds, against wargear its selections only fail to sum to.
        const lacking = [...delta].some(([item, n]) => n > 0 && !known.has(item))
        return { outcome: 'unmatched', reason: lacking ? 'wargear-vs-data-lacks' : 'no-equal-wargear', guess }
      }
      // The fewest selections in all, a part at a time a size larger where none of the fewest is valid.
      const levels = [parts.map(() => 0), ...parts.map((_, at) => parts.map((__, other) => Number(other === at)))]
      for (const level of levels) {
        if (level.some((extra, at) => !parts[at]![extra])) continue
        let combos: Selections[] = [{}]
        for (const [at, part] of parts.entries())
          combos = combos.flatMap((combo) => part![level[at]!]!.map((selections) => joined(combo, selections))).slice(0, KEPT * KEPT)
        const accepted = new Map<string, Selections>()
        for (const combo of combos) if (valid(combo)) accepted.set(sorted(combo), combo)
        if (!accepted.size) continue
        const [only] = accepted.values()
        const agrees = guessed && sorted(guessed) === sorted(only!) ? ', agrees' : ''
        return accepted.size === 1
          ? { outcome: 'translated', reason: level.some(Boolean) ? 'longer-valid' : 'fewest', selections: only!, guess: guess + agrees }
          : { outcome: 'ambiguous', reason: 'equally-few-disagree', guess }
      }
      return { outcome: 'unmatched', reason: 'refused-by-checker', guess }
    }
    const result = translate()
    note(`${result.outcome}: ${result.reason}`)
    if (result.guess) note(`guess ${result.guess}: ${result.outcome}`)
    results.push({ kind: saved.kind, list: saved.id, pick: priced.key, entryId: pick.entryId, unit, models: priced.size.models, ...result })
  }
}

fs.mkdirSync('data-dev', { recursive: true })
fs.writeFileSync('data-dev/saved-pick-translations.ndjson', results.map((result) => JSON.stringify(result)).join('\n'))
console.log(Object.fromEntries(Object.entries(tally).toSorted(([a], [b]) => byId(a, b))))
