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
import { wargearKey } from '../src/core/wargearNames'
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

/** Reviewed spellings: wargear as VS Data names it, by BSData's name, both as `wargearKey`s, read where the unit's VS Data wargear holds VS Data's and not BSData's. */
const SPELLINGS: Record<string, string | string[]> = {
  'absolver-bolt-pistol': 'absolvor-bolt-pistol',
  'adrathic-combi-destructors': 'adrathic-combi-destructor',
  agonizer: 'agoniser',
  'astartes-chainsword': 'chainsword',
  'astraeus-las-ripper': 'astareus-las-ripper',
  'axe-morkai': 'axe-of-morkai',
  'befouled-fangs-and-claws': 'befouled-claws-and-fangs',
  'bladed-horn': 'juggernauts-bladed-horn',
  'cavalry-sabre-clawed-limbs': 'cavalry-sabre-and-clawed-limbs',
  chainsword: 'astartes-chainsword',
  'channeler-stones': 'channeller-stones',
  'chirugeons-tools': 'chirurgeons-tools',
  'close-combat-weapons': 'close-combat-weapon',
  'combi-bolter': 'plague-combi-bolter',
  'commisars-pistol': 'commissars-pistol',
  'death-korps-of-krieg-medi-pack': 'death-korps-medi-pack',
  'distendible-jaw': 'distensible-jaw',
  'exo-armour-grenade-launcher': 'exoarmour-grenade-launcher',
  'fires-of-tzeentch': 'fire-of-tzeentch',
  'godhammer-lascannon': 'godhammer-lascannons',
  'grav-chute': 'grav-chutes',
  hellspear: 'helspear',
  'hellstrike-missiles': 'hellstrike-missile',
  'improvised-weapons': 'improvised-weapon',
  'kratos-battlecannon': 'kratos-battle-cannon',
  'lancer-laser-destroyer': 'laser-destroyer',
  'laservolley-cannon': 'laser-volley-cannon',
  'lashing-tongues': 'lashing-tongue',
  'lastrum-storm-bolters': 'lastrum-storm-bolter',
  'macharius-twin-battlecannon': 'macharius-twin-battle-cannon',
  'magma-cutter': 'magma-cutters',
  'master-crafted-power-weapon': 'master-crafted-power-sword',
  'multiple-rocket-pods': 'multiple-rocket-pod',
  'novitiate-autogun': 'autogun',
  'nuncio-aquila': 'nuncio-acquila',
  'pan-spectral-scanner': 'panspectral-scanner',
  'relic-great-axe': 'relic-greataxe',
  'scout-sniper-rifle': 'sniper-rifle',
  'seeker-tongues': 'exalted-seeker-tongues',
  'servo-arm': 'servitors-servo-arm',
  spinemaw: 'spinemaws',
  'sporocyst-bio-weapon': 'sporocyst-bio-weapons',
  'squig-jaws': 'squigs-jaws',
  'steeds-savage-claws': 'savage-claws',
  'teeth-and-claws': ['crushing-teeth-and-claws', 'crushing-teeth-and-jaws'],
  'termagant-spinefist': 'termagant-spinefists',
  'termite-melta-cutter': 'terrax-melta-cutter',
  'toxinjecter-harpoon': 'toxinjector-harpoon',
  'transonic-razor-chordclaw': 'transonic-razor-and-chordclaw',
  'twin-concussion-gauntlets': 'twin-concussion-gauntlet',
  'twin-infernus-incinerators': 'twin-infernus-incinerator',
  'twin-killsaw': 'twin-killsaws',
  'twin-power-fist': 'twin-power-fists',
  'zealots-vindicator': 'zealots-vindictor',
}
/** A leading article BSData prints on a named weapon and VS Data does not, as in The Emperor's Sword. */
const ARTICLE = /^the-/

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
  return { units, leaves }
}

/** Names compared by their letters and digits alone, without the "upgrade" BSData adds to some (Character upgrade). */
const same = (name: string) =>
  name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\bupgrade$/, '')
    .replace(/[^a-z0-9]/g, '')

/** A name's words, each without a closing s, so Relic Terminators reads as Relic Terminator. */
const words = (name: string) =>
  new Set(
    name
      .normalize('NFKD')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((word) => word.replace(/s$/, ''))
      .filter(Boolean),
  )

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

/** What a VS Data unit of `total` models carries when first fielded, as named items, or null when it cannot field that many. */
function vsBase(release: Release, unit: VsUnit, total: number) {
  const counts = new Map(unit.models.map((model) => [model.id, unit.defaultModels[model.id] ?? model.min]))
  const variable = unit.models.filter((model) => model.min !== model.max)
  if (variable.length === 1) {
    const others = unit.models.reduce((sum, model) => (model === variable[0] ? sum : sum + counts.get(model.id)!), 0)
    counts.set(variable[0]!.id, total - others)
  }
  const fits = unit.models.every((model) => counts.get(model.id)! >= model.min && counts.get(model.id)! <= model.max)
  if (!fits || [...counts.values()].reduce((sum, n) => sum + n, 0) !== total) return null
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
 * The selections, as option → wargear → count, whose changes add up to `target`: the fewest moves, and of equally few
 * the first in move order. A move taking a selection back counts -1. Null when none add up.
 */
function selectionsFor(all: readonly Move[], target: ReadonlyMap<string, number>) {
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
  const walk = (from: number, rest: Bag, left: number, taken: number[]): number[] | null => {
    if (!rest.size) return taken
    if (!left) return null
    for (const [key, n] of rest) if (Math.abs(n) > left * ((n > 0 ? gains : losses).get(key) ?? 0)) return null
    for (let at = from; at < moves.length; at++) {
      if (taken.filter((held) => held === at).length >= moves[at]!.most) continue
      const next = new Map(rest)
      for (const [key, n] of moves[at]!.change) add(next, key, -n)
      const found = walk(at, next, left - 1, [...taken, at])
      if (found) return found
    }
    return null
  }
  for (let size = 1; size <= MOST; size++) {
    const found = walk(0, new Map(target), size, [])
    if (!found) continue
    const selections: Record<string, Counts> = {}
    for (const at of found) {
      const { option, choice, sign } = moves[at]!
      ;(selections[option] ??= {})[choice] = (selections[option]?.[choice] ?? 0) + sign
    }
    return selections
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

/** A BSData name as VS Data spells it, where the unit's VS Data wargear lacks BSData's spelling. */
const keyOf = (name: string, vsKeys: ReadonlySet<string>) => {
  const key = wargearKey(name).replace(ARTICLE, '')
  return vsKeys.has(key) ? key : ([SPELLINGS[key] ?? []].flat().find((spelling) => vsKeys.has(spelling)) ?? key)
}

/** What a BSData-built unit carries, as named items in VS Data's spelling, leaving out Enhancements it holds. */
function bsdataBag(built: BuiltUnit, index: CatalogueIndex, vsKeys: ReadonlySet<string>, enhancementIds: ReadonlySet<string>) {
  const enhancement = (id: string) => {
    const definition = enhancementIds.has(id) ? index.definitions.get(id) : undefined
    return Boolean(definition) && !vsKeys.has(keyOf(nameOf(definition!, index.definitions), vsKeys))
  }
  const kept = (node: Selection): Selection => ({
    ...node,
    selections: node.selections?.filter((child) => !enhancement(child.id)).map(kept),
  })
  const bag: Bag = new Map()
  for (const { name, count } of wargearOf(kept(built.selection), index)) add(bag, keyOf(name, vsKeys), count)
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

const readIds = (file: string) =>
  z
    .object({ ids: z.record(z.string(), z.string()) })
    .parse(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../catalogue/legacy-ids', file), 'utf8'))).ids
const unitsMap = readIds('units.json')
const enhancementIds = new Set(Object.keys(readIds('enhancements.json')).map((key) => key.slice(key.lastIndexOf('/') + 1)))
const composition = readCatalogueComposition(catalogueDirectory)
if (!composition) throw new Error(`${catalogueDirectory} has no catalogue composition`)

/** A choice is VS Data option selections, as option → wargear → count, or the allegiance the unit takes. */
type Translation = { options: Record<string, Counts> } | { allegiance: string }
type UnitOptions = { unit: string; choices: Record<string, Translation>; unmatched: string[] }
/** The choices and spreads a unit is built with. */
type State = { choices: Readonly<Record<string, string>>; spreads: Readonly<Record<string, Readonly<Counts>>> }
type Option = UnitChoice['options'][number]
const out: Record<string, UnitOptions> = {}
const uncovered: string[] = []
const debug: string[] = []
const tally = {
  datasheets: 0,
  mapped: 0,
  noChange: 0,
  allegiances: 0,
  unmatched: 0,
  defaultsDiffer: 0,
  defaultsMapped: 0,
  defaultsNoChoice: 0,
}
/** How many choices a choice can be read beneath: a squad's loadout, then the weapons it opens. */
const DEPTH = 2

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
    const vsDefault = vsBase(release, unit, base.size.models)
    // What BSData's first fielding carries beyond VS Data's (negative where VS Data carries more), claimed by the choices
    // whose defaults make it.
    const unclaimed = vsDefault ? difference(bagOf(base), vsDefault) : new Map<string, number>()
    if (unclaimed.size) tally.defaultsDiffer++
    const result: UnitOptions = { unit: unitId, choices: {}, unmatched: [] }
    const unmatched = new Set<string>()
    const deferred = new Set<string>()
    const read = new Set<string>()
    const defaults = new Set<string>()
    /** Whether a group the squad divides holds all it can when first fielded, so taking one more gives one up. */
    const full = (choice: UnitChoice) => choice.room > 1 && choice.options.reduce((sum, { count }) => sum + count, 0) >= choice.room
    /** The option a choice holds when first fielded and that has no key of its own: a single pick's, or a full group's. */
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
    /**
     * The VS Data models a BSData model name stands for: those named alike, else those scoring best on the words they
     * share less the words only theirs (leaving out the unit's own name), as Paladin with Ancient's Banner is Paladin
     * Ancient and Assault Terminator w/ claws is Terminator, not Terminator Sergeant; else those its profile names.
     */
    const modelsNamed = (name: string | null | undefined, profile?: string | null): string[] | undefined => {
      if (!name) return undefined
      const alike = unit.models.filter((model) => same(model.name) === same(name))
      if (alike.length) return alike.map(({ id }) => id)
      const named = words(name)
      const shared = (model: VsUnit['models'][number]) => [...words(model.name)].filter((word) => named.has(word)).length
      const score = (model: VsUnit['models'][number]) =>
        shared(model) - [...words(model.name)].filter((word) => !named.has(word) && !unit.words.has(word)).length
      const sharing = unit.models.filter((model) => shared(model) > 0)
      const best = Math.max(...sharing.map(score))
      return sharing.length ? sharing.filter((model) => score(model) === best).map(({ id }) => id) : modelsNamed(profile)
    }
    /**
     * The selections for `target`, the same whichever of `carriers` makes the choice (all models where none is known),
     * taking models named alike as one; null where they disagree.
     */
    const translated = (
      carriers: readonly string[] | undefined,
      target: ReadonlyMap<string, number>,
      made: Readonly<Record<string, Counts>>,
    ) => {
      const ids = carriers ?? unit.models.map(({ id }) => id)
      if (!ids.length) return selectionsFor(movesFor(release, unit, undefined, made), target)
      const byName = new Map<string, string[]>()
      for (const id of ids) {
        const name = same(unit.models.find((model) => model.id === id)?.name ?? id)
        byName.set(name, [...(byName.get(name) ?? []), id])
      }
      const each = [...byName.values()].map((models) => selectionsFor(movesFor(release, unit, models, made), target))
      const first = JSON.stringify(sorted(each[0]))
      return each.every((selections) => selections && JSON.stringify(sorted(selections)) === first) ? each[0]! : null
    }
    /**
     * The keys of a choice's translations that some pick of it would carry past what VS Data allows: a selection taken
     * back that was never made, or an option taking more than it can. A pick applies each key once for each of its
     * option the pick holds beyond the first fielding, fewer counting negative.
     */
    const overflowing = (choice: UnitChoice, found: ReadonlyMap<string, Translation>, made: Readonly<Record<string, Counts>>) => {
      const bad = new Set<string>()
      const check = (applied: [string, number][]) => {
        const sum = joined(made)
        const touched = new Set<string>()
        for (const [key, times] of applied) {
          const translation = found.get(key)
          if (!translation || !('options' in translation)) continue
          for (const [optionId, chosen] of Object.entries(translation.options)) {
            touched.add(optionId)
            for (const [wargear, n] of Object.entries(chosen)) (sum[optionId] ??= {})[wargear] = (sum[optionId]?.[wargear] ?? 0) + n * times
          }
        }
        const over = [...touched].some((optionId) => {
          const counts = Object.values(sum[optionId] ?? {})
          const most = unit.options.find(({ id }) => id === optionId)?.most ?? 0
          return counts.some((n) => n < 0) || counts.reduce((total, n) => total + n, 0) > most
        })
        if (over) for (const [key] of applied) bad.add(key)
      }
      if (choice.room === 1) {
        for (const key of found.keys()) check([[key, 1]])
        return bad
      }
      const options = choice.options.filter((option) => !enhancementIds.has(option.id))
      const shape = (at: number, left: number, applied: [string, number][]) => {
        if (at === options.length) {
          check(applied)
          return
        }
        const option = options[at]!
        const key = `${choice.key}|${option.id}`
        for (let n = option.min; n <= Math.min(option.max, left); n++) {
          const times = n - option.count
          // A pick changing an option no key reads cannot be translated, so it can break nothing.
          if (times && !found.has(key) && !ordinary(choice, option)) continue
          shape(at + 1, left - n, times && found.has(key) ? [...applied, [key, times]] : applied)
        }
      }
      shape(0, choice.room, [])
      return bad
    }
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
      // A choice of one claims the defaults' difference before a squad's division does, which can only list it.
      for (const choice of from.choices.toSorted((one, other) => Number(one.room > 1) - Number(other.room > 1))) {
        if (isUnitCompositionChoice(choice) || choice.key in state.choices || choice.key in state.spreads) continue
        // Beneath a choice, what the unit offered before is read where it was offered.
        const options = choice.options.filter(
          (option) =>
            !enhancementIds.has(option.id) &&
            (!beneath || choice.key.startsWith(beneath.path) || !beneath.known.has(`${choice.key}|${option.id}`)),
        )
        // A choice on a model the unit does not field yet is read once the choice above it adds one.
        if (
          from.choices.some((parent) =>
            parent.options.some((option) => !option.count && choice.key.startsWith(`${parent.key}/${option.id}/`)),
          )
        ) {
          for (const option of options) deferred.add(`${choice.key}|${option.id}`)
          continue
        }
        const readings = options.flatMap((option) => {
          const key = `${choice.key}|${option.id}`
          if (key in result.choices || unmatched.has(key)) return []
          if (ordinary(choice, option)) return [{ key, option, state, built: from, delta: new Map<string, number>() }]
          const next = taking(state, choice, option)
          const built = build(next)
          if (!built) {
            unmatched.add(key)
            return []
          }
          // An option that brings a model is read against the unit grown by an ordinary model instead, the group held as it was.
          const reference =
            built.size.models === from.size.models
              ? from
              : build(
                  {
                    ...state,
                    spreads: { ...state.spreads, [choice.key]: Object.fromEntries(choice.options.map(({ id, count }) => [id, count])) },
                  },
                  built.size.models,
                )
          return [{ key, option, state: next, built, delta: difference(bagOf(built), reference ? bagOf(reference) : fromBag) }]
        })
        const owner = modelsNamed(choice.owner?.name, choice.owner?.profile)
        // The part of the defaults' difference this choice's default makes: what its other options take away, then
        // what VS Data's selections for its model take away.
        const shift: Bag = new Map()
        if (!depth && unclaimed.size) {
          const removed = reach(
            readings.map(({ delta }) => delta),
            -1,
          )
          for (const [item, n] of unclaimed) if (n > 0) shift.set(item, Math.min(n, removed.get(item) ?? 0))
          // What VS Data carries instead, as much as a selection for the same model takes away: beside what this default
          // carries, or, where BSData carries nothing VS Data lacks, alone where another option adds it, as a Predator's
          // sponsons that BSData leaves off.
          const swapped = [...shift.values()].some(Boolean)
          const extra = !swapped && ![...unclaimed.values()].some((n) => n > 0)
          const added = reach(
            readings.map(({ delta }) => delta),
            1,
          )
          const losses = reach(
            movesFor(release, unit, owner, made).map(({ change }) => change),
            -1,
          )
          for (const [item, n] of unclaimed)
            if (n < 0 && (swapped || (extra && added.has(item)))) shift.set(item, -Math.min(-n, losses.get(item) ?? 0))
          for (const [item, n] of [...shift]) {
            if (!n) shift.delete(item)
            add(unclaimed, item, -n)
          }
        }
        const found = new Map<string, Translation>()
        for (const { key, option, delta } of readings) {
          const isDefault = ordinary(choice, option)
          const allegiance = unit.allegiances.get(same(option.name))
          if (allegiance) {
            found.set(key, { allegiance })
            continue
          }
          if (isDefault && !shift.size) {
            read.add(key)
            continue
          }
          // A squad divides itself by counts, so a difference its first fielding makes rides on none of them, and every
          // count would be read against the wrong first fielding.
          if (choice.room > 1 && shift.size) {
            unmatched.add(key)
            continue
          }
          const target = new Map(delta)
          for (const [item, n] of shift) add(target, item, n)
          // Nothing changing is a reading only when the option names wargear the unit already carries, or brings BSData's
          // unit to VS Data's default.
          const selections = target.size
            ? translated(owner ?? (isModel(option.id) ? modelsNamed(option.name) : undefined), target, made)
            : delta.size || fromBag.has(keyOf(option.name, vsKeys))
              ? {}
              : null
          if (selections) {
            found.set(key, { options: selections })
            if (isDefault) defaults.add(key)
          } else {
            unmatched.add(key)
            if (process.env.OPTIONS_DEBUG)
              debug.push(
                `${unitId}\t${choice.name}: ${option.name}${isDefault ? ' (default)' : ''}\t${JSON.stringify(Object.fromEntries(target))}`,
              )
          }
        }
        for (const key of overflowing(choice, found, made)) {
          found.delete(key)
          unmatched.add(key)
          if (process.env.OPTIONS_DEBUG) debug.push(`${unitId}\t${choice.name}: overflows\t${key}`)
        }
        for (const [key, translation] of found) result.choices[key] = translation
        for (const { key, option, state: next, built } of readings)
          if (!ordinary(choice, option) && !unit.allegiances.has(same(option.name)) && depth < DEPTH) {
            const translation = found.get(key)
            visit(built, next, joined(made, translation && 'options' in translation ? translation.options : {}), depth + 1, {
              path: `${choice.key}/${option.id}/`,
              known: new Set(from.choices.flatMap((offered) => offered.options.map(({ id }) => `${offered.key}|${id}`))),
            })
          }
      }
    }
    visit(base, { choices: {}, spreads: {} }, unit.defaults, 0)
    for (const key of deferred) if (!(key in result.choices) && !read.has(key)) unmatched.add(key)
    if (unclaimed.size) {
      tally.defaultsNoChoice++
      if (process.env.OPTIONS_DEBUG) debug.push(`${unitId}\tdefaults no choice changes\t${JSON.stringify(Object.fromEntries(unclaimed))}`)
    }
    result.unmatched = [...unmatched].toSorted(byId)
    tally.unmatched += result.unmatched.length
    for (const [key, translation] of Object.entries(result.choices))
      if ('allegiance' in translation) tally.allegiances++
      else if (defaults.has(key)) tally.defaultsMapped++
      else if (Object.keys(translation.options).length) tally.mapped++
      else tally.noChange++
    out[entryId] = result
  }
}

console.log({ ...tally, choices: tally.mapped + tally.noChange + tally.allegiances + tally.defaultsMapped + tally.unmatched })
console.log(`Read for the current rules version only; not covered (${uncovered.length}):\n  ${uncovered.join('\n  ')}`)
if (process.env.OPTIONS_DEBUG) fs.writeFileSync(process.env.OPTIONS_DEBUG, debug.join('\n'))
// Frozen like the other maps: a choice keeps the selections it was first given, and this run only adds.
const file = path.join(import.meta.dirname, '../catalogue/legacy-ids/options.json')
const frozen = fs.existsSync(file) ? legacyOptionsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))).units : {}
for (const [entryId, held] of Object.entries(frozen)) {
  const found = out[entryId]
  if (found && found.unit !== held.unit) throw new Error(`options: ${entryId} is frozen for ${held.unit}; this run names ${found.unit}`)
  const choices = { ...held.choices }
  for (const [key, selections] of Object.entries(found?.choices ?? {})) {
    if (key in choices && JSON.stringify(sorted(choices[key])) !== JSON.stringify(sorted(selections)))
      throw new Error(
        `options: ${entryId} ${key} is frozen as ${JSON.stringify(choices[key])}; this run names ${JSON.stringify(selections)}`,
      )
    choices[key] = selections
  }
  const unmatched = [...new Set([...held.unmatched, ...(found?.unmatched ?? [])])].filter((key) => !(key in choices)).toSorted(byId)
  out[entryId] = { unit: held.unit, choices, unmatched }
}
fs.writeFileSync(file, `${JSON.stringify({ format: 'praetorium.legacy-options.v1', units: sorted(out) }, null, 2)}\n`)
execFileSync('pnpm', ['exec', 'oxfmt', file], { stdio: 'inherit' })
