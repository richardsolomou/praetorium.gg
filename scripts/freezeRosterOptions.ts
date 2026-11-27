import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type CatalogueIndex, nameOf, resolve } from '../src/core/catalogue'
import type { Selection } from '../src/core/evaluate'
import { buildUnit, type BuiltUnit } from '../src/core/roster'
import { isUnitCompositionChoice, type UnitChoice } from '../src/core/unitChoices'
import { wargearOf } from '../src/core/wargear'
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { correctedOptions, legacyIdCorrections, legacyRosterIds } from '../src/core/legacyRosterIds'
import { vsDataDefinitions } from '../src/core/vsDataConstruction'
import { checkVsUnit } from '../src/core/vsDataRoster'
import { wargearKey } from '../src/core/wargearNames'
import { ARTICLE, vsSpelling } from './lib/wargearSpellings'
import { modelsNamed as modelsNamedIn, same, words } from './lib/vsDataModelNames'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'

/**
 * Writes `catalogue/legacy-ids/options.json`: for each datasheet of the current rules version, the VS Data selections
 * each of its BSData choices stands for. `docs/development/catalogue-data.md` ("Saved IDs in VS Data") describes the
 * reading and `legacyOptionsSchema` how to apply it. Fails rather than change a frozen choice, and lists the entries it
 * leaves out: retained rules versions' `~` IDs and IDs the current catalogue no longer holds.
 *
 *   pnpm exec tsx scripts/freezeRosterOptions.ts <catalogue directory> <directory of unpacked releases, one per rules version>
 */
const [catalogueDirectory, releases] = process.argv.slice(2)
if (!catalogueDirectory || !releases)
  throw new Error('Usage: tsx scripts/freezeRosterOptions.ts <catalogue directory> <releases directory>')

const entrySchema = z.object({ id: z.string(), kind: z.string(), name: z.string().optional(), retired: z.unknown().optional() })
const recordSchema = z.object({ kind: z.string(), id: z.string(), data: z.record(z.string(), z.unknown()) })
type Counts = Record<string, number>
type Bag = Map<string, number>
type VsUnit = {
  id: string
  /** Its name's words, which a model's name may repeat without saying which model it is. */
  words: Set<string>
  models: { id: string; name: string; min: number; max: number; wargear: Counts }[]
  options: VsOption[]
  wargear: Counts
  defaults: Record<string, Counts>
  defaultModels: Counts
  /** Each allegiance the unit may take, by its name as `same` reads it. */
  allegiances: Map<string, string>
}
/** `most` is the most selections the option takes in the unit at its largest. */
type VsOption = { id: string; carrier: string | undefined; choices: string[]; replaces: Counts; most: number }

function readRelease(directory: string) {
  const read = (file: string): unknown => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'))
  const names = new Map(
    z
      .object({ entries: z.array(entrySchema) })
      .parse(read('identity.json'))
      .entries.map((entry) => [entry.id, entry.name ?? entry.id]),
  )
  const manifest = z
    .object({ categories: z.array(z.object({ name: z.string(), records: z.array(z.object({ path: z.string(), kind: z.string() })) })) })
    .parse(read('manifest.json'))
  const byKind = new Map<string, { id: string; data: Record<string, unknown> }[]>()
  for (const entry of manifest.categories.find((category) => category.name === 'rosters')?.records ?? []) {
    const record = recordSchema.parse(read(entry.path))
    byKind.set(record.kind, [...(byKind.get(record.kind) ?? []), record])
  }
  const includes = new Map((byKind.get('wargear') ?? []).map((record) => [record.id, (record.data.includes ?? {}) as Counts]))
  const definitions = vsDataDefinitions({
    release: directory,
    rulesVersion: { edition: '', update: '' },
    definitions: Object.fromEntries(
      [...byKind].map(([kind, records]) => [
        kind,
        Object.fromEntries(records.map(({ id, data }) => [id, { name: names.get(id) ?? id, data }])),
      ]),
    ),
    unavailable: [],
    points: [],
  })
  const units = new Map<string, VsUnit>()
  for (const { id, data } of byKind.get('unit') ?? [])
    units.set(id, {
      id,
      words: words(names.get(id) ?? id),
      models: [],
      options: [],
      wargear: (data.wargear ?? {}) as Counts,
      defaults: (data.defaults ?? {}) as Record<string, Counts>,
      defaultModels: (data.defaultModels ?? {}) as Counts,
      allegiances: new Map(
        ((data.allegiances ?? []) as { choices: string[] }[]).flatMap((offer) =>
          offer.choices.map((choice) => [same(names.get(choice) ?? choice), choice] as const),
        ),
      ),
    })
  for (const { id, data } of byKind.get('model') ?? [])
    units.get(data.unit as string)?.models.push({
      id,
      name: names.get(id) ?? id,
      min: data.min as number,
      max: data.max as number,
      wargear: data.wargear as Counts,
    })
  const largest = new Map((byKind.get('unit') ?? []).map(({ id, data }) => [id, Math.max(...((data.sizes ?? [1]) as number[]))]))
  for (const { id, data } of byKind.get('roster-option') ?? []) {
    const unit = units.get(data.unit as string)
    if (!unit) continue
    // As VS Data's `optionBounds` counts them, at the largest size with every carrier fielded.
    const total = largest.get(unit.id) ?? 1
    const carrier = data.carrier as string | undefined
    const carriers = carrier ? (unit.models.find((model) => model.id === carrier)?.max ?? 0) : total
    const per = data.per as 'carrier' | { models: number } | undefined
    const blocks = carriers === 0 ? 0 : per === 'carrier' ? carriers : per ? Math.floor(total / per.models) : 1
    const choose = data.choose as { max: number }
    const bySize = (data.bySize ?? []) as { max: number }[]
    unit.options.push({
      id,
      carrier,
      choices: data.choices as string[],
      replaces: (data.replaces ?? {}) as Counts,
      most: Math.max(choose.max * blocks, ...bySize.map(({ max }) => max)),
    })
  }
  /** A wargear ID as the named items it holds, keyed as `wargearKey` reads a name. */
  const leaves = (id: string, n: number, into: Bag) => {
    const inner = includes.get(id)
    if (inner && Object.keys(inner).length) for (const [part, m] of Object.entries(inner)) leaves(part, n * m, into)
    else add(into, wargearKey(names.get(id) ?? id).replace(ARTICLE, ''), n)
  }
  return { units, leaves, definitions }
}

const add = (bag: Bag, key: string, n: number) => {
  const next = (bag.get(key) ?? 0) + n
  if (next) bag.set(key, next)
  else bag.delete(key)
}

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

type Release = ReturnType<typeof readRelease>

/** Every named item a VS Data unit can carry. */
function vsKeysOf(release: Release, unit: VsUnit) {
  const into: Bag = new Map()
  const all = [
    ...unit.models.flatMap((model) => Object.keys(model.wargear)),
    ...Object.keys(unit.wargear),
    ...Object.values(unit.defaults).flatMap((selections) => Object.keys(selections)),
    ...unit.options.flatMap((option) => [...option.choices, ...Object.keys(option.replaces)]),
  ]
  for (const id of all) release.leaves(id, 1, into)
  return new Set(into.keys())
}

/** A VS Data unit's model counts at `total` models as first fielded, or null when it cannot field that many. */
function vsCounts(unit: VsUnit, total: number) {
  const counts = new Map(unit.models.map((model) => [model.id, unit.defaultModels[model.id] ?? model.min]))
  const variable = unit.models.filter((model) => model.min !== model.max)
  if (variable.length === 1) {
    const others = unit.models.reduce((sum, model) => (model === variable[0] ? sum : sum + counts.get(model.id)!), 0)
    counts.set(variable[0]!.id, total - others)
  }
  const fits = unit.models.every((model) => counts.get(model.id)! >= model.min && counts.get(model.id)! <= model.max)
  return fits && [...counts.values()].reduce((sum, n) => sum + n, 0) === total ? counts : null
}

/** What a VS Data unit of `total` models carries when first fielded, as named items, or null when it cannot field that many. */
function vsBase(release: Release, unit: VsUnit, total: number) {
  const counts = vsCounts(unit, total)
  if (!counts) return null
  const bag: Bag = new Map()
  for (const model of unit.models) for (const [id, n] of Object.entries(model.wargear)) release.leaves(id, n * counts.get(model.id)!, bag)
  for (const [id, n] of Object.entries(unit.wargear)) release.leaves(id, n, bag)
  for (const selections of Object.values(unit.defaults)) for (const [id, n] of Object.entries(selections)) release.leaves(id, n, bag)
  return bag
}

/** The most selections a choice may stand for. */
const MOST = 4

type Move = { option: string; choice: string; sign: number; most: number; change: Bag }

/**
 * Each VS Data selection a choice can stand for, in option then wargear ID order: one of an option carried by one of
 * `carriers` or by no model, or taking back one already made (`made`: the unit's defaults and the choices above).
 */
function movesFor(release: Release, unit: VsUnit, carriers: readonly string[] | undefined, made: Readonly<Record<string, Counts>>): Move[] {
  const changeOf = (optionId: string, choice: string, sign: number) => {
    const change: Bag = new Map()
    release.leaves(choice, sign, change)
    for (const [id, n] of Object.entries(unit.options.find((option) => option.id === optionId)?.replaces ?? {}))
      release.leaves(id, -sign * n, change)
    return change
  }
  const order = (a: { option: string; choice: string }, b: { option: string; choice: string }) =>
    byId(a.option, b.option) || byId(a.choice, b.choice)
  return [
    ...unit.options
      .filter((option) => !carriers || !option.carrier || carriers.includes(option.carrier))
      .flatMap((option) => option.choices.map((choice) => ({ option: option.id, choice, sign: 1, most: Infinity })))
      .toSorted(order),
    ...Object.entries(made)
      .flatMap(([option, chosen]) =>
        Object.entries(chosen).flatMap(([choice, n]) => (n > 0 ? [{ option, choice, sign: -1, most: n }] : [])),
      )
      .toSorted(order),
  ]
    .map((move) => ({ ...move, change: changeOf(move.option, move.choice, move.sign) }))
    .filter(({ change }) => change.size)
}

/**
 * The selections, as option → wargear → count, whose changes add up to `target` and that `valid` accepts: the fewest
 * moves, and of equally few the first in move order. A move taking a selection back counts -1. Null when none do, or,
 * with `unique`, when another as few would do too.
 */
function selectionsFor(
  all: readonly Move[],
  target: ReadonlyMap<string, number>,
  valid: (selections: Record<string, Counts>) => boolean = () => true,
  unique = false,
) {
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
  const gains = reach(
    moves.map(({ change }) => change),
    1,
  )
  const losses = reach(
    moves.map(({ change }) => change),
    -1,
  )
  function* walk(from: number, rest: Bag, left: number, taken: number[]): Generator<number[]> {
    if (!rest.size) {
      yield taken
      return
    }
    if (!left) return
    for (const [key, n] of rest) if (Math.abs(n) > left * ((n > 0 ? gains : losses).get(key) ?? 0)) return
    for (let at = from; at < moves.length; at++) {
      if (taken.filter((held) => held === at).length >= moves[at]!.most) continue
      const next = new Map(rest)
      for (const [key, n] of moves[at]!.change) add(next, key, -n)
      yield* walk(at, next, left - 1, [...taken, at])
    }
  }
  const selectionsOf = (found: number[]) => {
    const selections: Record<string, Counts> = {}
    for (const at of found) {
      const { option, choice, sign } = moves[at]!
      ;(selections[option] ??= {})[choice] = (selections[option]?.[choice] ?? 0) + sign
    }
    return selections
  }
  for (let size = 1; size <= MOST; size++) {
    let first: Record<string, Counts> | null = null
    for (const found of walk(0, new Map(target), size, [])) {
      const selections = selectionsOf(found)
      if (!valid(selections)) continue
      if (!first) first = selections
      else if (JSON.stringify(sorted(selections)) !== JSON.stringify(sorted(first))) return null
      if (!unique) break
    }
    if (first) return first
  }
  return null
}

/** The most of each item one change gains (`sign` 1) or loses (-1). */
const reach = (changes: readonly ReadonlyMap<string, number>[], sign: number) => {
  const most = new Map<string, number>()
  for (const change of changes)
    for (const [key, n] of change) if (Math.sign(n) === sign) most.set(key, Math.max(most.get(key) ?? 0, Math.abs(n)))
  return most
}

/** What a BSData-built unit carries, as named items in VS Data's spelling, leaving out Enhancements it holds. */
function bsdataBag(built: BuiltUnit, index: CatalogueIndex, vsKeys: ReadonlySet<string>, enhancementIds: ReadonlySet<string>) {
  const enhancement = (id: string) => {
    const definition = enhancementIds.has(id) ? index.definitions.get(id) : undefined
    return Boolean(definition) && !vsKeys.has(vsSpelling(nameOf(definition!, index.definitions), vsKeys))
  }
  const kept = (node: Selection): Selection => ({
    ...node,
    selections: node.selections?.filter((child) => !enhancement(child.id)).map(kept),
  })
  const bag: Bag = new Map()
  for (const { name, count } of wargearOf(kept(built.selection), index)) add(bag, vsSpelling(name, vsKeys), count)
  return bag
}

/** Two sets of selections as one. */
const joined = (...all: Readonly<Record<string, Counts>>[]) => {
  const into: Record<string, Counts> = {}
  for (const selections of all)
    for (const [option, chosen] of Object.entries(selections))
      for (const [choice, n] of Object.entries(chosen)) (into[option] ??= {})[choice] = (into[option]?.[choice] ?? 0) + n
  return into
}

const difference = (after: ReadonlyMap<string, number>, before: ReadonlyMap<string, number>) => {
  const delta = new Map(after)
  for (const [key, n] of before) add(delta, key, -n)
  return delta
}

/** An object with its keys sorted at every depth, so equal maps serialise alike. */
const sorted = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .toSorted(([a], [b]) => byId(a, b))
          .map(([key, inner]) => [key, sorted(inner)]),
      )
    : value

const unitsMap = legacyRosterIds.units
const enhancementIds = new Set(Object.keys(legacyRosterIds.enhancements).map((key) => key.slice(key.lastIndexOf('/') + 1)))
const composition = readCatalogueComposition(catalogueDirectory)
if (!composition) throw new Error(`${catalogueDirectory} has no catalogue composition`)

/** A choice is VS Data option selections, as option → wargear → count, or the allegiance the unit takes. */
type Translation = { options: Record<string, Counts> } | { allegiance: string }
type UnitOptions = {
  unit: string
  base?: { options: Record<string, Counts> } | 'unmatched'
  floor?: Record<string, string | Counts>
  choices: Record<string, Translation>
  unmatched: string[]
}
/** The choices and spreads a unit is built with. */
type State = { choices: Readonly<Record<string, string>>; spreads: Readonly<Record<string, Readonly<Counts>>> }
type Option = Pick<UnitChoice['options'][number], 'id' | 'name' | 'count' | 'min' | 'max' | 'default' | 'profile'>
const out: Record<string, UnitOptions> = {}
const uncovered: string[] = []
const debug: string[] = []
const tally = { datasheets: 0, mapped: 0, noChange: 0, allegiances: 0, unmatched: 0, unreached: 0, base: 0, baseUnmatched: 0, floors: 0 }
/** How many choices a choice can be read beneath: a squad's loadout, then the weapons it opens. */
const DEPTH = 2
/** Every size BSData fields a unit at. */
const sizesOf = (built: BuiltUnit) =>
  built.size.options ?? Array.from({ length: built.size.max - built.size.min + 1 }, (_, at) => built.size.min + at)
/** A choice taking nothing, as a floor pick leaves an optional pintle weapon off. */
const NOTHING: Option = { id: '', name: '', count: 0, min: 0, max: 1 }

for (const entry of composition.editions.filter((candidate) => candidate.base)) {
  const release = readRelease(path.join(releases, entry.edition.id))
  const loaded = loadCatalogue(editionDirectory(catalogueDirectory, entry), entry.edition)
  if (!loaded) throw new Error(`${entry.edition.id} has no catalogue`)
  const { index } = loaded
  for (const [entryId, unitId] of Object.entries(unitsMap)) {
    const unit = release.units.get(unitId)
    const base = !entryId.includes('~') && unit && index.definitions.has(entryId) ? buildUnit(entryId, index) : null
    if (!unit || !base) {
      uncovered.push(`${entryId} → ${unitId}`)
      continue
    }
    tally.datasheets++
    const vsKeys = vsKeysOf(release, unit)
    const bagOf = (built: BuiltUnit) => bsdataBag(built, index, vsKeys, enhancementIds)
    /** Whether an option is a model, named for the loadout it carries, as Plague Marine w/ meltagun. */
    const isModel = (id: string) => {
      const definition = index.definitions.get(id)
      return definition !== undefined && resolve(definition, index).type === 'model'
    }
    const build = (state: State, models?: number) =>
      buildUnit(entryId, index, models, state.choices, Object.keys(state.spreads).length ? { spreads: state.spreads } : undefined)
    // The sizes BSData fields the unit at and VS Data can too, where every translation is checked.
    const sizes = sizesOf(base).filter((total) => vsCounts(unit, total))
    const problemsAt = (selections: Readonly<Record<string, Counts>>, total: number) => {
      const found = new Set<string>()
      checkVsUnit(
        release.definitions,
        { unit: unit.id, models: Object.fromEntries(vsCounts(unit, total)!), options: selections },
        (code, message) => found.add(`${code}: ${message}`),
      )
      return found
    }
    /** Whether VS Data's checker accepts `selections` made on top of `made` at every size, raising nothing `made` does not. */
    const madeProblems = new WeakMap<object, Map<number, Set<string>>>()
    const validOn = (made: Readonly<Record<string, Counts>>, selections: Readonly<Record<string, Counts>>) =>
      sizes.every((total) => {
        const known = madeProblems.get(made) ?? new Map<number, Set<string>>()
        madeProblems.set(made, known)
        const before = known.get(total) ?? problemsAt(made, total)
        known.set(total, before)
        return [...problemsAt(joined(made, selections), total)].every((problem) => before.has(problem))
      })
    const result: UnitOptions = { unit: unitId, choices: {}, unmatched: [] }
    // BSData's first fielding as VS Data selections on VS Data's: the same at every size, and the only fewest that do.
    const differences = [base.size.models, ...sizes].map((total) => {
      const vs = vsBase(release, unit, total)
      const bs = buildUnit(entryId, index, total)
      return vs && bs ? JSON.stringify(sorted(Object.fromEntries(difference(bagOf(bs), vs)))) : null
    })
    const firstDifference = new Map(Object.entries(JSON.parse(differences[0] ?? '{}') as Counts))
    if (differences[0] === null || differences.some((found) => found !== differences[0])) result.base = 'unmatched'
    else if (firstDifference.size) {
      const selections = selectionsFor(
        movesFor(release, unit, undefined, unit.defaults),
        firstDifference,
        (found) => validOn(unit.defaults, found),
        true,
      )
      result.base = selections ? { options: selections } : 'unmatched'
    }
    const made0 = joined(unit.defaults, typeof result.base === 'object' ? result.base.options : {})
    const unmatched = new Set<string>()
    const seen = new Set<string>()
    /** Whether a group the squad divides holds all it can when first fielded, so taking one more gives one up. */
    const full = (choice: UnitChoice) => choice.room > 1 && choice.options.reduce((sum, { count }) => sum + count, 0) >= choice.room
    /** The option a choice holds when first fielded, which changes nothing: a single pick's, or a full group's. */
    const ordinary = (choice: UnitChoice, option: Option) => option.id === choice.chosen && (choice.room === 1 || full(choice))
    /**
     * The unit with one more choice made: the option taken, or for a group the squad divides, one more of it, which in
     * a full group takes one from the option the group names as ordinary, else from the first other held.
     */
    const taking = (state: State, choice: UnitChoice, option: Option): State => {
      if (choice.room === 1) return { ...state, choices: { ...state.choices, [choice.key]: option.id } }
      const given = full(choice)
        ? (choice.options.find((other) => other.default && other.id !== option.id && other.count > 0) ??
          choice.options.find((other) => other.id !== option.id && other.count > 0))
        : undefined
      const held = Object.fromEntries(choice.options.filter(({ count }) => count > 0).map(({ id, count }) => [id, count]))
      return {
        ...state,
        spreads: {
          ...state.spreads,
          [choice.key]: { ...held, ...(given ? { [given.id]: given.count - 1 } : {}), [option.id]: option.count + 1 },
        },
      }
    }
    const modelsNamed = (name: string | null | undefined, profile?: string | null) => modelsNamedIn(unit.models, unit.words, name, profile)
    /**
     * The selections for `target` that VS Data's checker accepts, the same whichever of `carriers` makes the choice
     * (all models where none is known), taking models named alike as one; null where they disagree.
     */
    const translated = (
      carriers: readonly string[] | undefined,
      target: ReadonlyMap<string, number>,
      made: Readonly<Record<string, Counts>>,
    ) => {
      const valid = (selections: Record<string, Counts>) => validOn(made, selections)
      const ids = carriers ?? unit.models.map(({ id }) => id)
      if (!ids.length) return selectionsFor(movesFor(release, unit, undefined, made), target, valid)
      const byName = new Map<string, string[]>()
      for (const id of ids) {
        const name = same(unit.models.find((model) => model.id === id)?.name ?? id)
        byName.set(name, [...(byName.get(name) ?? []), id])
      }
      const each = [...byName.values()].map((models) => selectionsFor(movesFor(release, unit, models, made), target, valid))
      const first = JSON.stringify(sorted(each[0]))
      return each.every((selections) => selections && JSON.stringify(sorted(selections)) === first) ? each[0]! : null
    }
    /**
     * The keys of a divided group that some pick of it, within its options' bounds, would make a unit VS Data's checker
     * refuses. A pick applies each key once for each of its option the pick holds beyond the first fielding, fewer
     * counting negative.
     */
    const refused = (choice: UnitChoice, found: ReadonlyMap<string, Translation>, made: Readonly<Record<string, Counts>>) => {
      const bad = new Set<string>()
      const options = choice.options.filter((option) => !enhancementIds.has(option.id))
      const shape = (at: number, left: number, applied: [string, number][]) => {
        if (at === options.length) {
          if (!applied.length) return
          const selections: Record<string, Counts> = {}
          for (const [key, times] of applied) {
            const translation = found.get(key)
            if (translation && 'options' in translation)
              for (const [optionId, chosen] of Object.entries(translation.options))
                for (const [wargear, n] of Object.entries(chosen))
                  (selections[optionId] ??= {})[wargear] = (selections[optionId]?.[wargear] ?? 0) + n * times
          }
          if (!validOn(made, selections)) {
            if (process.env.OPTIONS_DEBUG && applied.some(([key]) => !bad.has(key)))
              debug.push(
                `${unitId}\tshape\t${JSON.stringify(applied)}\t${sizes
                  .map((total) =>
                    [...problemsAt(joined(made, selections), total)].filter((problem) => !problemsAt(made, total).has(problem)).join('; '),
                  )
                  .find(Boolean)}`,
              )
            for (const [key] of applied) bad.add(key)
          }
          return
        }
        const option = options[at]!
        const key = `${choice.key}|${option.id}`
        for (let n = option.min; n <= Math.min(option.max, left); n++) {
          const times = n - option.count
          // A pick changing an option no key reads cannot be translated, so it can break nothing.
          if (times && !found.has(key)) continue
          shape(at + 1, left - n, times ? [...applied, [key, times]] : applied)
        }
      }
      shape(0, choice.room, [])
      return bad
    }
    // The option a floor pick's unmade choice takes, where it is not the first fielding's.
    const floorBuilt = buildUnit(entryId, index, undefined, {}, { floor: true })
    const floor: Record<string, string | Counts> = {}
    for (const choice of floorBuilt?.choices ?? []) {
      if (isUnitCompositionChoice(choice)) continue
      const printed = base.choices.find(({ key }) => key === choice.key)
      if (choice.room === 1 && choice.chosen !== (printed?.chosen ?? '')) floor[choice.key] = choice.chosen
      const counts = Object.fromEntries(choice.options.filter(({ count }) => count > 0).map(({ id, count }) => [id, count]))
      const first = Object.fromEntries((printed?.options ?? []).filter(({ count }) => count > 0).map(({ id, count }) => [id, count]))
      if (choice.room > 1 && JSON.stringify(sorted(counts)) !== JSON.stringify(sorted(first))) floor[choice.key] = counts
    }
    if (Object.keys(floor).length) result.floor = floor
    // A choice is read against the unit it is made on, at the size it is made at: the first fielding, or for a choice
    // another opens, the unit with that one taken, whose selections it may take back.
    const visit = (
      from: BuiltUnit,
      state: State,
      made: Readonly<Record<string, Counts>>,
      depth: number,
      beneath?: { path: string; known: ReadonlySet<string> },
    ) => {
      const fromBag = bagOf(from)
      const atFirstSize = from.size.models === base.size.models
      /** Each key read here with its choice, for checking keys of different choices together. */
      const together: { choice: string; key: string }[] = []
      for (const choice of from.choices) {
        if (choice.key in state.choices || choice.key in state.spreads) continue
        const composing = isUnitCompositionChoice(choice)
        // Beneath a choice, what the unit offered before is read where it was offered.
        const options = [
          ...choice.options.filter(
            (option) =>
              !enhancementIds.has(option.id) &&
              (!beneath || choice.key.startsWith(beneath.path) || !beneath.known.has(`${choice.key}|${option.id}`)),
          ),
          ...(floor[choice.key] === '' && choice.room === 1 ? [NOTHING] : []),
        ]
        for (const option of options) seen.add(`${choice.key}|${option.id}`)
        // A choice on a model the unit does not field yet is read once the choice above it adds one.
        if (
          from.choices.some((parent) =>
            parent.options.some((option) => !option.count && choice.key.startsWith(`${parent.key}/${option.id}/`)),
          )
        )
          continue
        const readings = options.flatMap((option) => {
          const key = `${choice.key}|${option.id}`
          if (key in result.choices || unmatched.has(key)) return []
          if (ordinary(choice, option)) return [{ key, option, state, built: from, delta: new Map<string, number>() }]
          // The reader counts a divided group from its first fielding at the unit's first size, so one only other sizes
          // field must start empty.
          if (choice.room > 1 && !atFirstSize && choice.options.some(({ count }) => count > 0)) {
            unmatched.add(key)
            return []
          }
          const next = taking(state, choice, option)
          const built = build(next)
          if (!built) {
            unmatched.add(key)
            return []
          }
          // An option that brings a model is read against the unit grown by an ordinary model instead, the group held as
          // it was; a unit composition against the unit resized as it is.
          const reference =
            built.size.models === from.size.models
              ? from
              : composing
                ? build(state, built.size.models)
                : build(
                    {
                      ...state,
                      spreads: { ...state.spreads, [choice.key]: Object.fromEntries(choice.options.map(({ id, count }) => [id, count])) },
                    },
                    built.size.models,
                  )
          return [{ key, option, state: next, built, delta: difference(bagOf(built), reference ? bagOf(reference) : fromBag) }]
        })
        const owner = composing ? undefined : modelsNamed(choice.owner?.name, choice.owner?.profile)
        const found = new Map<string, Translation>()
        for (const { key, option, delta } of readings) {
          const allegiance = unit.allegiances.get(same(option.name))
          if (allegiance) {
            found.set(key, { allegiance })
            continue
          }
          // Nothing changing is a reading for the option first fielded, a unit composition, or an option naming wargear
          // the unit already carries.
          const selections = delta.size
            ? translated(owner ?? (isModel(option.id) ? modelsNamed(option.name) : undefined), delta, made)
            : ordinary(choice, option) || composing || fromBag.has(vsSpelling(option.name, vsKeys))
              ? {}
              : null
          if (selections) found.set(key, { options: selections })
          else {
            unmatched.add(key)
            if (process.env.OPTIONS_DEBUG)
              debug.push(`${unitId}\t${choice.name}: ${option.name}\t${JSON.stringify(Object.fromEntries(delta))}`)
          }
        }
        if (choice.room > 1)
          for (const key of refused(choice, found, made)) {
            found.delete(key)
            unmatched.add(key)
            if (process.env.OPTIONS_DEBUG) debug.push(`${unitId}\t${choice.name}: refused\t${key}`)
          }
        for (const [key, translation] of found) {
          result.choices[key] = translation
          if ('options' in translation && Object.keys(translation.options).length) together.push({ choice: choice.key, key })
        }
        for (const { key, option, state: next, built } of readings) {
          const translation = found.get(key)
          if (ordinary(choice, option) || (translation && 'allegiance' in translation) || (!composing && depth >= DEPTH)) continue
          visit(
            built,
            next,
            joined(made, translation && 'options' in translation ? translation.options : {}),
            composing ? depth : depth + 1,
            {
              path: `${choice.key}/${option.id}/`,
              known: new Set(from.choices.flatMap((offered) => offered.options.map(({ id }) => `${offered.key}|${id}`))),
            },
          )
        }
      }
      // Two keys of different choices made together must still make a unit VS Data's checker accepts.
      const refusedTogether = new Set<string>()
      for (const [at, one] of together.entries())
        for (const other of together.slice(at + 1)) {
          if (one.choice === other.choice || refusedTogether.has(one.key) || refusedTogether.has(other.key)) continue
          const selections = joined(
            (result.choices[one.key] as { options: Record<string, Counts> }).options,
            (result.choices[other.key] as { options: Record<string, Counts> }).options,
          )
          if (validOn(made, selections)) continue
          refusedTogether.add(one.key)
          refusedTogether.add(other.key)
          if (process.env.OPTIONS_DEBUG) debug.push(`${unitId}\trefused together\t${one.key} ${other.key}`)
        }
      for (const key of refusedTogether) {
        delete result.choices[key]
        unmatched.add(key)
      }
    }
    visit(base, { choices: {}, spreads: {} }, made0, 0)
    // Choices only other sizes field are read there.
    for (const total of sizesOf(base)) {
      const sized = total === base.size.models ? null : buildUnit(entryId, index, total)
      if (sized) visit(sized, { choices: {}, spreads: {} }, made0, 0)
    }
    // Every key a pick can hold is mapped or listed: those of each size, and of one choice made at each, however made.
    const reached = (built: BuiltUnit | null) => {
      for (const choice of built?.choices ?? [])
        for (const option of choice.options) if (!enhancementIds.has(option.id) && option.max > 0) seen.add(`${choice.key}|${option.id}`)
    }
    for (const total of sizesOf(base)) {
      const sized = buildUnit(entryId, index, total)
      reached(sized)
      for (const choice of sized?.choices ?? [])
        for (const option of choice.options) {
          if (enhancementIds.has(option.id) || option.id === choice.chosen) continue
          const held = Object.fromEntries(choice.options.filter(({ count }) => count > 0).map(({ id, count }) => [id, count]))
          reached(
            choice.room === 1
              ? buildUnit(entryId, index, total, { [choice.key]: option.id })
              : buildUnit(entryId, index, total, {}, { spreads: { [choice.key]: { ...held, [option.id]: option.count + 1 } } }),
          )
        }
    }
    for (const key of seen)
      if (!(key in result.choices) && !unmatched.has(key)) {
        unmatched.add(key)
        tally.unreached++
      }
    for (const key of Object.keys(result.choices)) unmatched.delete(key)
    result.unmatched = [...unmatched].toSorted(byId)
    tally.unmatched += result.unmatched.length
    if (result.base === 'unmatched') tally.baseUnmatched++
    else if (result.base) tally.base++
    if (result.floor) tally.floors++
    for (const translation of Object.values(result.choices))
      if ('allegiance' in translation) tally.allegiances++
      else if (Object.keys(translation.options).length) tally.mapped++
      else tally.noChange++
    out[entryId] = result
  }
}

console.log({ ...tally, choices: tally.mapped + tally.noChange + tally.allegiances + tally.unmatched })
console.log(`Read for the current rules version only; not covered (${uncovered.length}):\n  ${uncovered.join('\n  ')}`)
if (process.env.OPTIONS_DEBUG) fs.writeFileSync(process.env.OPTIONS_DEBUG, debug.join('\n'))
// Frozen like the other maps: a choice keeps the selections it was first given, a unit its base and floor, and this run
// only adds. A corrected entry is checked as its correction gives it and written as first frozen.
const file = path.join(import.meta.dirname, '../catalogue/legacy-ids/options.json')
const raw = fs.existsSync(file) ? legacyOptionsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))).units : {}
const frozen = correctedOptions(raw, legacyIdCorrections)
const differ = (one: unknown, other: unknown) => JSON.stringify(sorted(one)) !== JSON.stringify(sorted(other))
for (const [entryId, held] of Object.entries(frozen)) {
  const found = out[entryId]
  if (found && found.unit !== held.unit) throw new Error(`options: ${entryId} is frozen for ${held.unit}; this run names ${found.unit}`)
  for (const field of ['base', 'floor'] as const)
    if (found && differ(held[field], found[field]))
      throw new Error(
        `options: ${entryId} ${field} is frozen as ${JSON.stringify(held[field])}; this run names ${JSON.stringify(found[field])}`,
      )
  const choices = { ...held.choices }
  for (const [key, selections] of Object.entries(found?.choices ?? {})) {
    if (key in choices && differ(choices[key], selections))
      throw new Error(
        `options: ${entryId} ${key} is frozen as ${JSON.stringify(choices[key])}; this run names ${JSON.stringify(selections)}`,
      )
    choices[key] = selections
  }
  const unmatched = [...new Set([...held.unmatched, ...(found?.unmatched ?? [])])].filter((key) => !(key in choices)).toSorted(byId)
  out[entryId] = { ...held, choices, unmatched }
}
for (const correction of legacyIdCorrections) {
  if (correction.section !== 'options') continue
  if (differ(out[correction.key], correction.entry))
    throw new Error(`options: this run adds to corrected ${correction.key}; extend its correction instead`)
  out[correction.key] = raw[correction.key]!
}
fs.writeFileSync(file, `${JSON.stringify({ format: 'praetorium.legacy-options.v1', units: sorted(out) }, null, 2)}\n`)
execFileSync('pnpm', ['exec', 'oxfmt', file], { stdio: 'inherit' })
