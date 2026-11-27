import fs from 'node:fs'
import path from 'node:path'
import { type CatalogueIndex, resolve } from '../src/core/catalogue'
import { modelProfileOf } from '../src/core/definitions'
import { battleSizeSelection, type Selection } from '../src/core/evaluate'
import { buildUnit, type RosterPick, type VsPick } from '../src/core/roster'
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { wargearOf } from '../src/core/wargear'
import { wargearKey } from '../src/core/wargearNames'
import { type Counts, vsDataConstructionSchema, vsDataDefinitions, type VsDataDefinitions } from '../src/core/vsDataConstruction'
import { type SavedPicks, savedPickKey } from '../src/core/savedPicks'
import { hasWarlordToggle } from '../src/core/unitChoices'
import type { LoadedCatalogue } from '../src/shared/catalogueIndex'
import { checkVsRoster, checkVsUnit, type VsRosterUnit } from '../src/core/vsDataRoster'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'

type PricedUnit = NonNullable<ReturnType<typeof calculateRosterPrice>>['units'][number]
import { rosterDetachments } from '../src/shared/rosterDetachments'
import { inBook } from '../src/shared/vsDataPoints'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { copiedAtOf, savedLists, savedLoadouts } from './lib/vsDataRosterParity'
import { SAVED_PICKS_RUN, savedPicksRunSchema } from './lib/savedPicksRun'
import { catalogueUnitErrors, leaves, legacyIds, modelsByName, specialOf, vsModels } from './lib/vsDataRosters'
import { modelsNamed, same, words } from '../src/shared/vsDataModelNames'
import { vsSpelling } from '../src/shared/wargearSpellings'

/**
 * Every saved pick in a local production copy (`scripts/fetchProductionCopy.ts`) of a backup that records when it captured
 * the database,
 * translated whole into VS Data in its own rules version: saved rosters, lists fielded into a battle or a sealed event,
 * and saved unit loadouts. The unit Praetorium builds today is matched by the fewest VS Data option selections, in a
 * fixed tie order, whose unit has the same models and the same wargear (through the reviewed spellings) and that VS
 * Data's checker accepts at the pick's size. Each pick is `translated`, `ambiguous` (equally few valid selections
 * disagree) or `unmatched`, with a reason. For the current rules version the per-choice map
 * (`catalogue/legacy-ids/options.json`) is a guess to compare against.
 *
 * Writes `data-dev/saved-pick-translations.ndjson`, which names lists by ID; `data-dev/saved-pick-gaps.json`, the picks left
 * on BSData for what VS Data or the reviewed spellings lack, counted by datasheet, option paths and cause, with no list
 * named; and `data-dev/saved-picks.json` (`savedPicksRunSchema`), written once it reads whole: the copy's capture time,
 * the key of every pick its live records hold, and the frozen translations, every translated pick by `savedPickKey`
 * less any key another pick reads differently or not at all. All are derived from players' lists, so they stay in
 * `data-dev`. Prints counts by kind and rules version.
 *
 *   pnpm exec tsx scripts/translateSavedPicks.ts [catalogue directory] [list copy]
 */
const directory = path.resolve(process.argv[2] ?? 'catalogue-data')
const listFile = path.resolve(process.argv[3] ?? 'data-dev/production-lists.ndjson.gz')
// Read first, so a copy that cannot date its records stops the run before any translation.
const copiedAt = await copiedAtOf(listFile)
const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const definitionsByEdition = new Map<string, VsDataDefinitions | null>()
/** A rules version's VS Data definitions, or null where the snapshot holds no release for it. */
const definitionsOf = (edition: string) => {
  if (!definitionsByEdition.has(edition)) {
    const file = path.join(directory, 'summaries', `${edition}.construction.json`)
    definitionsByEdition.set(
      edition,
      fs.existsSync(file) ? vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))) : null,
    )
  }
  return definitionsByEdition.get(edition)!
}
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
type Outcome = {
  outcome: 'translated' | 'ambiguous' | 'unmatched'
  reason: string
  selections?: Selections
  vs?: VsPick
  guess?: string
  /** What a pick left on BSData stumbled on, by name and ID only, for whoever fixes VS Data or the reviewed spellings. */
  detail?: Record<string, unknown>
}

/** The most selections one connected part of a unit's wargear may take, and the search steps it may spend finding them. */
const MOST = 24
const STEPS = 400_000
/**
 * How many equally few answers a part keeps, in option then wargear ID order, and a unit combines (squared): past either,
 * the pick is ambiguous, since a dropped answer could be as good as a kept one.
 */
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
function vsBag(definitions: VsDataDefinitions, unit: string, models: Counts, selections: Selections) {
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
function movesOf(definitions: VsDataDefinitions, unit: string, defaults: Selections): Move[] {
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
 * The fewest selections giving `target`, solved for each part of the wargear no selection connects to another, as `solve`
 * gives them for each part.
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

/**
 * Every equally few multiset of `moves` giving `target`, by size from the fewest, up to two sizes, and whether `KEPT`
 * cut a size short. No sizes where some item no move changes the way it needs, so none ever can; null where the steps
 * or `MOST` run out first.
 */
function solve(moves: readonly Move[], target: ReadonlyMap<string, number>) {
  const reach = (from: number, sign: number) => {
    const most = new Map<string, number>()
    for (const { change } of moves.slice(from))
      for (const [key, n] of change) if (Math.sign(n) === sign) most.set(key, Math.max(most.get(key) ?? 0, Math.abs(n)))
    return most
  }
  const gains = moves.map((_, at) => reach(at, 1))
  const losses = moves.map((_, at) => reach(at, -1))
  if ([...target].some(([key, n]) => !((n > 0 ? gains[0] : losses[0])?.has(key) ?? false))) return { levels: [], cut: false }
  let steps = STEPS
  let cut = false
  const found: Selections[][] = []
  for (let size = 1; size <= MOST && found.length < 2; size++) {
    const level: Selections[] = []
    const walk = (at: number, rest: Bag, left: number, counts: number[]) => {
      if (steps-- < 0) return
      if (level.length >= KEPT) {
        cut = true
        return
      }
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
  return found.length ? { levels: found, cut } : null
}

/** The pick read through the per-choice map, as the reader rule gives it: null where a key or the base is unmatched. */
function guessOf(
  catalogueId: string,
  entryId: string,
  pick: { choices?: Record<string, string>; spreads?: Record<string, Counts>; floor?: boolean },
) {
  const entry = inBook(map, catalogueId, entryId)
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

/** Each item a VS Data unit carries by the kind of model carrying it, models named alike as one kind, `''` for the unit. */
function vsByKind(definitions: VsDataDefinitions, unit: string, models: Counts, selections: Selections) {
  const kinds = new Map<string, Bag>()
  const into = (kind: string) => kinds.get(kind) ?? kinds.set(kind, new Map()).get(kind)!
  const kindOf = (model: string | undefined) => (model ? same(definitions.get('model', model)?.name ?? model) : '')
  for (const model of definitions.modelsOf(unit))
    for (const [id, n] of Object.entries(model.data.wargear)) leaves(definitions, id, n * (models[model.id] ?? 0), into(kindOf(model.id)))
  for (const [id, n] of Object.entries(definitions.get('unit', unit)?.data.wargear ?? {})) leaves(definitions, id, n, into(''))
  for (const [optionId, chosen] of Object.entries(selections)) {
    const option = definitions.get('roster-option', optionId)
    const bag = into(kindOf(option?.data.carrier))
    for (const [choice, n] of Object.entries(chosen)) {
      leaves(definitions, choice, n, bag)
      for (const [id, m] of Object.entries(option?.data.replaces ?? {})) leaves(definitions, id, -m * n, bag)
    }
  }
  return kinds
}

/**
 * Each item a BSData unit carries by the VS Data kind of model carrying it, by the carrier rule the per-choice map uses
 * (`modelsNamed`), `''` where no one kind is named and for what no model holds.
 */
function bsByKind(
  definitions: VsDataDefinitions,
  selection: Selection,
  index: CatalogueIndex,
  unit: string,
  item: (name: string) => string | null,
) {
  const kinds = new Map<string, Bag>()
  const into = (kind: string) => kinds.get(kind) ?? kinds.set(kind, new Map()).get(kind)!
  const vsModelsOf = definitions.modelsOf(unit).map(({ id, name }) => ({ id, name }))
  const unitWords = words(definitions.get('unit', unit)?.name ?? unit)
  const held = (node: Selection, carriers: number, bag: Bag) => {
    for (const { name, count } of wargearOf(node, index, carriers)) {
      const key = item(name)
      if (key) add(bag, key, count)
    }
  }
  const whole: Bag = new Map()
  held(selection, 1, whole)
  const placed: Bag = new Map()
  const walk = (node: Selection) => {
    for (const child of node.selections ?? []) {
      const definition = index.definitions.get(child.id)
      if (!definition || resolve(definition, index).type !== 'model') {
        walk(child)
        continue
      }
      const target = resolve(definition, index)
      const named = modelsNamed(vsModelsOf, unitWords, definition.name ?? target.name, modelProfileOf(definition, index))
      const carriers = new Set((named ?? []).map((id) => same(vsModelsOf.find((model) => model.id === id)!.name)))
      const bag: Bag = new Map()
      held(child, child.count ?? 1, bag)
      for (const [key, n] of bag) {
        add(into(carriers.size === 1 ? [...carriers][0]! : ''), key, n)
        add(placed, key, n)
      }
    }
  }
  const root = index.definitions.get(selection.id)
  if (root && resolve(root, index).type === 'model') walk({ id: '', selections: [selection] })
  else walk(selection)
  for (const [key, n] of whole) add(into(''), key, n - (placed.get(key) ?? 0))
  return kinds
}

const problemsOf = (definitions: VsDataDefinitions, read: VsRosterUnit) => {
  const found: string[] = []
  checkVsUnit(definitions, read, (code, message) => found.push(`${code}: ${message}`))
  return found
}

type Unit = {
  definitions: VsDataDefinitions
  loaded: LoadedCatalogue
  /** The book the unit stands in, its rules version, the battle size and Detachments it is built under, if a list's. */
  catalogueId: string
  edition: string
  roster: Selection[]
  /** The list's VS Data faction, Detachments and battle size, which its Enhancement, allegiance and Warlord are checked in. */
  faction: string
  detachments: string[]
  battleSize: string | undefined
  pick: RosterPick
  priced: PricedUnit
  loadout: boolean
}

/** One saved pick translated whole, with the `VsPick` it stands for where it is translated. */
function translate({
  definitions,
  loaded,
  catalogueId,
  edition,
  roster,
  faction,
  detachments,
  battleSize,
  pick,
  priced,
  loadout,
}: Unit): Outcome {
  const retained = catalogueId.includes('~')
  const key = (keys: Record<string, string>, id: string) => (retained ? keys[`${edition}~${id}`] : undefined) ?? keys[id]
  const book = catalogueId.slice(catalogueId.indexOf('~') + 1)
  const unit = key(ids.units, `${book}/${pick.entryId}`) ?? key(ids.units, pick.entryId)
  if (!unit || !definitions.get('unit', unit)) return { outcome: 'unmatched', reason: 'no-unit' }
  // A unit the pick's book cannot field, through its faction, parent or allies, is a datasheet ID the map reads as another
  // faction's (a shared library entry), so its translation would stand for the wrong unit.
  const bookFaction = pick.catalogueId ? key(ids.books, pick.catalogueId.slice(pick.catalogueId.indexOf('~') + 1)) : faction
  const own = definitions.get('faction', bookFaction ?? '')
  const unitFaction = definitions.get('unit', unit)!.data.faction
  if (
    !own ||
    (unitFaction !== own.id && unitFaction !== own.data.parent && !(own.data.allies ?? []).some((ally) => ally.units.includes(unit)))
  )
    return { outcome: 'unmatched', reason: 'not-in-book', detail: { book: bookFaction, unitFaction } }
  const special = specialOf(priced, detachments, ids, key)
  // A unit takes one Enhancement, an upgrade counting as one; a pick holding more is refused today as well.
  if (special.enhancements.length + special.missing.length > 1) return { outcome: 'unmatched', reason: 'several-enhancements' }
  // The frozen maps can name an Enhancement or upgrade VS Data's release does not define yet.
  if (special.missing.length || (special.enhancement && !definitions.get('enhancement', special.enhancement)))
    return { outcome: 'unmatched', reason: 'enhancement-vs-data-lacks' }
  const built = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
    primaryCatalogueId: catalogueId,
    mustering: true,
    roster,
    spreads: pick.spreads,
    toggles: pick.toggles,
    floor: pick.floor,
  })
  if (!built) return { outcome: 'unmatched', reason: 'no-build' }
  // A unit today's checks refuse keeps that verdict on BSData: VS Data accepting its translation would change what was saved.
  const refused = catalogueUnitErrors(loaded.index, roster, catalogueId, built.selection)
  if (refused.length) return { outcome: 'unmatched', reason: 'refused-today', detail: { catalogue: refused } }
  const models = vsModels(definitions, unit, modelsByName(built.selection, loaded.index), priced.size.models)
  if (!models)
    return {
      outcome: 'unmatched',
      reason: 'models-unread',
      detail: {
        bsData: Object.fromEntries(modelsByName(built.selection, loaded.index)),
        vsData: definitions.modelsOf(unit).map((model) => model.id),
      },
    }
  const defaults = (definitions.get('unit', unit)!.data.defaults ?? {}) as Selections
  const read: VsRosterUnit = { unit, models }
  const modelProblems = problemsOf(definitions, { ...read, options: defaults }).filter((code) => !code.startsWith('option'))
  if (modelProblems.length) return { outcome: 'unmatched', reason: 'models-refused', detail: { models, problems: modelProblems } }
  // The marks and Enhancements a unit holds are its allegiance and Enhancement, never wargear.
  const allegiances = new Map(
    (definitions.get('unit', unit)!.data.allegiances ?? []).flatMap((offer) =>
      offer.choices.map((id) => [same(definitions.get('allegiance', id)?.name ?? id), id] as const),
    ),
  )
  // An option names its allegiance as VS Data does, or ends with it (Mark of Khorne), as `vsDataErrors` reads it.
  const allegianceOf = (name: string) => [...allegiances].find(([named]) => same(name) === named || same(name).endsWith(named))?.[1]
  const taken = priced.choices.flatMap((choice) => choice.options.filter((option) => option.count > 0 && allegianceOf(option.name)))
  if (taken.length > 1) return { outcome: 'ambiguous', reason: 'allegiances' }
  // A loadout keeps a unit's models and wargear by VS Data IDs, never its allegiance.
  if (loadout && taken.length) return { outcome: 'unmatched', reason: 'loadout-allegiance' }
  // A datasheet that stands for one of the unit's allegiances (one Soul Grinder datasheet per god) takes it.
  const allegiance = (taken[0] && allegianceOf(taken[0].name)) || key(ids.unitAllegiances, pick.entryId)
  // An allegiance the unit needs that BSData left as an unmade choice stays unmade, so the builder asks for one.
  const unset =
    !allegiance &&
    definitions
      .get('unit', unit)!
      .data.allegiances?.some((offer) => offer.required && (!offer.detachment || detachments.includes(offer.detachment)))
  let warlord: string | undefined
  if (hasWarlordToggle(priced.toggles)) {
    // The Warlord is the unit's Character model, else its one model of a kind, as `vsDataErrors` reads it.
    const kinds = definitions.modelsOf(unit)
    warlord = (
      kinds.find((model) => model.data.keywords?.some((keyword) => keyword.toUpperCase() === 'CHARACTER')) ??
      kinds.find((model) => model.data.max === 1) ??
      kinds[0]
    )?.id
  }
  const specials = new Set([...special.names, ...taken.map((option) => wargearKey(option.name))])
  const known = new Set(vsBag(definitions, unit, Object.fromEntries(definitions.modelsOf(unit).map((model) => [model.id, 1])), {}).keys())
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
  for (const [item, n] of vsBag(definitions, unit, models, defaults)) add(delta, item, -n)
  // Equipment VS Data's unit carries that no option of it takes away is what the app prints, where BSData's built unit
  // leaves it out (Azrael's Lion Helm), so the unit keeps it.
  const removable = new Set(
    movesOf(definitions, unit, defaults).flatMap(({ change }) => [...change].flatMap(([item, n]) => (n < 0 ? [item] : []))),
  )
  const keptDefaults = [...delta].flatMap(([item, n]) => (n < 0 && !removable.has(item) ? [item] : []))
  for (const item of keptDefaults) delta.delete(item)
  const valid = (selections: Selections) => !problemsOf(definitions, { ...read, options: joined(defaults, selections) }).length
  // How the per-choice map reads a pick of the current rules version, to compare against: equal and valid, or not.
  const guessed = edition === base!.edition.id && !loadout ? guessOf(catalogueId, pick.entryId, pick) : null
  const gives = (selections: Selections) => {
    const bag = vsBag(definitions, unit, models, joined(defaults, selections))
    return bag.size === target.size && [...bag].every(([item, n]) => target.get(item) === n)
  }
  const guess =
    edition !== base!.edition.id || loadout
      ? undefined
      : !guessed
        ? 'map-unmatched'
        : !gives(guessed)
          ? 'map-differs'
          : !valid(guessed)
            ? 'map-refused'
            : 'map-equal'
  // Each item the pick's wargear changes from VS Data's defaults, with every option choice of the unit that changes it.
  const involved = () =>
    Object.fromEntries(
      [...delta].map(([item, n]) => [
        `${item} ${n > 0 ? '+' : ''}${n}`,
        definitions.optionsOf(unit).flatMap((option) =>
          option.data.choices.flatMap((choice) => {
            const into: Bag = new Map()
            leaves(definitions, choice, 1, into)
            for (const [replaced, m] of Object.entries(option.data.replaces ?? {})) leaves(definitions, replaced, -m, into)
            return into.has(item) ? [`${option.id}: ${choice}`] : []
          }),
        ),
      ]),
    )
  // Wargear no VS Data selection of the unit adds, before any search.
  const missing = [...delta].flatMap(([item, n]) => (n > 0 && !known.has(item) ? [item] : []))
  if (missing.length) return { outcome: 'unmatched', reason: 'wargear-vs-data-lacks', guess, detail: { missing, changes: involved() } }
  const parts = delta.size ? partsOf(movesOf(definitions, unit, defaults), delta) : []
  if (parts.some((part) => part === null)) return { outcome: 'unmatched', reason: 'search-limit', guess, detail: { changes: involved() } }
  if (parts.some((part) => !part!.levels.length))
    return { outcome: 'unmatched', reason: 'no-equal-wargear', guess, detail: { changes: involved() } }
  // What VS Data's checker says of the first of the fewest selections it refuses, should it refuse them all.
  let firstRefusal: { selections: string; problems: string[] } | undefined
  // The fewest selections in all; where none is valid, every way of taking one part a size larger, together.
  const tiers = [[parts.map(() => 0)], parts.map((_, at) => parts.map((__, other) => Number(other === at)))]
  for (const [tier, levels] of tiers.entries()) {
    const accepted = new Map<string, Selections>()
    let cut = false
    for (const level of levels) {
      if (level.some((extra, at) => !parts[at]!.levels[extra])) continue
      cut ||= parts.some((part) => part!.cut)
      let combos: Selections[] = [{}]
      for (const [at, part] of parts.entries()) {
        combos = combos.flatMap((combo) => part!.levels[level[at]!]!.map((selections) => joined(combo, selections)))
        if (combos.length > KEPT * KEPT) {
          combos = combos.slice(0, KEPT * KEPT)
          cut = true
        }
      }
      for (const combo of combos)
        if (valid(combo)) accepted.set(sorted(combo), combo)
        else
          firstRefusal ??= { selections: sorted(combo), problems: problemsOf(definitions, { ...read, options: joined(defaults, combo) }) }
    }
    if (!accepted.size) continue
    // A capped search may have left out an answer as good as the ones it kept.
    if (cut) return { outcome: 'ambiguous', reason: 'search-cap', guess }
    let reason = tier ? 'longer-valid' : 'fewest'
    let kept = [...accepted.values()]
    // Each kind of model must hold at least the copies of an item BSData's models of that kind carry; copies no one
    // kind holds may go anywhere.
    const bs = bsByKind(definitions, built.selection, loaded.index, unit, (name) =>
      specials.has(wargearKey(name)) ? null : vsSpelling(name, known),
    )
    const count = (kinds: Map<string, Bag>, kind: string, item: string) => kinds.get(kind)?.get(item) ?? 0
    const placed = (kinds: Map<string, Bag>, entries: readonly [string, string][]) =>
      entries.every(([kind, item]) => count(kinds, kind, item) >= count(bs, kind, item))
    const each = kept.map((selections) => vsByKind(definitions, unit, models, joined(defaults, selections)))
    // Ties go to the selections that put each item they disagree on where the BSData unit's models carry it.
    if (kept.length > 1) {
      const entries = new Set(
        each.flatMap((kinds) => [...kinds].flatMap(([kind, bag]) => [...bag.keys()].map((item) => `${kind}\u0000${item}`))),
      )
      const disputed = [...entries]
        .map((entry) => entry.split('\u0000') as [string, string])
        .filter(([kind, item]) => kind && new Set(each.map((kinds) => count(kinds, kind, item))).size > 1)
      kept = kept.filter((_, at) => placed(each[at]!, disputed))
      reason = kept.length === 1 ? 'tie-placed' : kept.length ? 'tie-placed-alike' : 'tie-placed-elsewhere'
    }
    const [only] = kept
    if (kept.length !== 1) return { outcome: 'ambiguous', reason, guess }
    const agrees = guessed && sorted(guessed) === sorted(only!) ? ', agrees' : ''
    // Whether it also puts every item where BSData's models carry it, which the final freeze should look at where not.
    const everywhere = [...bs].flatMap(([kind, bag]) => (kind ? [...bag.keys()].map((item) => [kind, item] as [string, string]) : []))
    const where = placed(vsByKind(definitions, unit, models, joined(defaults, only!)), everywhere) ? '' : ', placed elsewhere'
    const options = Object.fromEntries(
      Object.entries(joined(defaults, only!)).flatMap(([option, chosen]) => {
        const held = Object.entries(chosen).filter(([, n]) => n !== 0)
        return held.length ? [[option, Object.fromEntries(held)]] : []
      }),
    )
    const vs: VsPick = {
      models,
      options,
      ...(special.enhancement ? { enhancement: special.enhancement } : {}),
      ...(allegiance ? { allegiance } : {}),
      ...(warlord ? { warlord } : {}),
    }
    // VS Data's checker must accept its Enhancement, allegiance and Warlord in the list's Detachments and battle size.
    const said = (candidate: VsRosterUnit) =>
      new Set(
        checkVsRoster(definitions, { faction, detachments, ...(battleSize ? { battleSize } : {}), units: [candidate] })
          .filter((problem) => problem.unit === 0)
          .map((problem) => problem.message),
      )
    const bare = said({ unit, models, options })
    if ([...said({ unit, ...vs })].some((message) => !bare.has(message))) return { outcome: 'unmatched', reason: 'specials-refused', guess }
    return {
      outcome: 'translated',
      reason: reason + where + (keptDefaults.length ? ', defaults kept' : '') + (unset ? ', allegiance unset' : ''),
      selections: only!,
      vs,
      ...(guess ? { guess: guess + agrees } : {}),
    }
  }
  return { outcome: 'unmatched', reason: 'refused-by-checker', guess, detail: { changes: involved(), ...firstRefusal } }
}

const results: object[] = []
const live = new Set<string>()
const tally: Record<string, number> = {}
const note = (key: string) => (tally[key] = (tally[key] ?? 0) + 1)
const byKind: Record<string, Record<string, number>> = {}
const frozen = new Map<string, VsPick>()
/** Picks left on BSData for what VS Data or the reviewed spellings lack, alike ones counted together. */
const GAPS = new Set([
  'not-in-book',
  'wargear-vs-data-lacks',
  'no-equal-wargear',
  'refused-by-checker',
  'models-refused',
  'models-unread',
  'refused-today',
])
const gaps = new Map<string, number>()
/** Lists, by kind, holding a translated unit that needs an allegiance it never chose. */
const askedForAllegiance = new Map<string, Set<string>>()
const disputed = new Set<string>()
/** Every pick of one list or loadout, translated and counted, and frozen by key where it is translated. */
function translateAll(
  kind: string,
  id: string,
  list: { catalogueId: string; detachmentIds: string[]; picks: RosterPick[] },
  limit: number,
  loadout: boolean,
) {
  const loaded = editions.catalogueFor(list.catalogueId)
  const edition = loaded?.edition?.id ?? base!.edition.id
  // Every pick's key, translated or not: a publication may not drop one a live record still holds.
  for (const pick of list.picks)
    live.add(savedPickKey({ rulesVersion: edition, catalogueId: list.catalogueId, detachmentIds: list.detachmentIds }, pick))
  const counts = (byKind[`${kind} ${edition}`] ??= {})
  const count = (outcome: string, n = 1) => (counts[outcome] = (counts[outcome] ?? 0) + n)
  const definitions = loaded && definitionsOf(edition)
  if (!loaded || !definitions) return count(loaded ? 'no VS Data release' : 'no catalogue', list.picks.length)
  const input = { ...savedRosterPriceInput({ ...list, disposition: null, limit }), includeUnitLimits: false }
  const price = calculateRosterPrice(input, loaded, editions.rulesFor(list.catalogueId))
  if (!price) return count('does not price', list.picks.length)
  count('not priced', list.picks.length - price.units.length)
  const roster = loadout
    ? []
    : [
        ...[battleSizeSelection(loaded.index, limit)].flatMap((selection) => (selection ? [selection] : [])),
        ...rosterDetachments(loaded, list.catalogueId, list.detachmentIds).selections,
      ]
  const retained = list.catalogueId.includes('~')
  const detachments = list.detachmentIds.flatMap((detachment) => {
    const found = (retained ? ids.detachments[`${edition}~${detachment}`] : undefined) ?? ids.detachments[detachment]
    return found ? [found] : []
  })
  const book = list.catalogueId.slice(list.catalogueId.indexOf('~') + 1)
  const faction = (retained ? ids.books[`${edition}~${book}`] : undefined) ?? ids.books[book] ?? ''
  const battleSize = loadout ? undefined : definitions.all('battle-size').find((size) => size.data.points === limit)?.id
  for (const priced of price.units) {
    const pick = list.picks[priced.key]!
    const result = translate({
      definitions,
      loaded,
      catalogueId: list.catalogueId,
      edition,
      roster,
      faction,
      detachments,
      battleSize,
      pick,
      priced,
      loadout,
    })
    count(result.outcome)
    note(`${result.outcome}: ${result.reason}`)
    if (result.reason.endsWith('allegiance unset'))
      (askedForAllegiance.get(kind) ?? askedForAllegiance.set(kind, new Set()).get(kind)!).add(id)
    if (result.guess) note(`guess ${result.guess}: ${result.outcome}`)
    const key = savedPickKey({ rulesVersion: edition, catalogueId: list.catalogueId, detachmentIds: list.detachmentIds }, pick)
    // The key leaves out the battle size and whether the pick is a loadout's, so a key read any other way anywhere is not frozen.
    if (!result.vs) disputed.add(key)
    else {
      const before = frozen.get(key)
      if (before && JSON.stringify(sortedJson(before)) !== JSON.stringify(sortedJson(result.vs))) disputed.add(key)
      frozen.set(key, result.vs)
    }
    if (GAPS.has(result.reason)) {
      // Option paths as the pick saves them (`<choice key>|<option ID>`, a divided group's with its count), never names it was given.
      const paths = [
        ...Object.entries(pick.choices ?? {}).map(([choice, option]) => `${choice}|${option}`),
        ...Object.entries(pick.spreads ?? {}).flatMap(([choice, held]) =>
          Object.entries(held).map(([option, n]) => `${choice}|${option} x${n}`),
        ),
      ].toSorted(byId)
      const frozenUnit = (held: string) => (retained ? ids.units[`${edition}~${held}`] : undefined) ?? ids.units[held]
      const unit = frozenUnit(`${book}/${pick.entryId}`) ?? frozenUnit(pick.entryId)
      const gap = JSON.stringify({
        rulesVersion: edition,
        datasheet: priced.name,
        entryId: pick.entryId,
        unit,
        reason: result.reason,
        models: priced.size.models,
        paths,
        ...result.detail,
      })
      gaps.set(gap, (gaps.get(gap) ?? 0) + 1)
    }
    const { vs: _vs, detail: _detail, ...reported } = result
    results.push({ kind, list: id, pick: priced.key, edition, key, entryId: pick.entryId, models: priced.size.models, ...reported })
  }
}
const sortedJson = (value: unknown): unknown =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .toSorted(([a], [b]) => byId(a, b))
          .map(([key, inner]) => [key, sortedJson(inner)]),
      )
    : value

for (const saved of await savedLists(listFile)) translateAll(saved.kind, saved.id, saved, saved.limit, false)
// A loadout is no list: it is priced at Strike Force with no Detachment, as the builder offers it.
for (const loadout of await savedLoadouts(listFile)) translateAll('loadout', loadout.id, { ...loadout, detachmentIds: [] }, 2000, true)

for (const key of disputed) frozen.delete(key)
const translations: SavedPicks = {
  format: 'praetorium.saved-picks.v1',
  picks: Object.fromEntries([...frozen].toSorted(([a], [b]) => byId(a, b))),
}
fs.mkdirSync('data-dev', { recursive: true })
fs.writeFileSync('data-dev/saved-pick-translations.ndjson', results.map((result) => JSON.stringify(result)).join('\n'), { mode: 0o600 })
fs.writeFileSync(
  'data-dev/saved-pick-gaps.json',
  `${JSON.stringify(
    [...gaps].toSorted(([a, m], [b, n]) => n - m || byId(a, b)).map(([gap, count]) => ({ count, ...JSON.parse(gap) })),
    null,
    2,
  )}\n`,
  { mode: 0o600 },
)
// One output, written only once it reads whole, so the translations are always dated by the copy they came from.
const run = savedPicksRunSchema.parse({ copiedAt, live: [...live].toSorted(byId), translations })
fs.writeFileSync(SAVED_PICKS_RUN, `${JSON.stringify(run)}\n`, { mode: 0o600 })
console.log(Object.fromEntries(Object.entries(tally).toSorted(([a], [b]) => byId(a, b))))
console.log(Object.fromEntries(Object.entries(byKind).toSorted(([a], [b]) => byId(a, b))))
console.log({ frozen: frozen.size, keysLeftOnBsData: disputed.size })
console.log({ listsAskedForAllegiance: Object.fromEntries([...askedForAllegiance].map(([kind, lists]) => [kind, lists.size])) })
