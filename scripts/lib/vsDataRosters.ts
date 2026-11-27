import { type CatalogueIndex, resolve } from '../../src/core/catalogue'
import { battleSizeSelection, type Selection } from '../../src/core/evaluate'
import { buildUnit } from '../../src/core/roster'
import { hasWarlordToggle } from '../../src/core/unitChoices'
import { wargearOf } from '../../src/core/wargear'
import { wargearKey } from '../../src/core/wargearNames'
import { ARTICLE, vsSpelling } from './wargearSpellings'
import { same } from './vsDataModelNames'
import type { Counts, VsDataDefinitions } from '../../src/core/vsDataConstruction'
import { checkVsUnit, type VsRoster, type VsRosterUnit } from '../../src/core/vsDataRoster'
import type { LoadedCatalogue } from '../../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../../src/shared/pricing'
import { rosterDetachments } from '../../src/shared/rosterDetachments'
import type { PriceInput } from '../../src/contracts/schemas'
import { legacyRosterIds } from '../../src/core/legacyRosterIds'

type Price = NonNullable<ReturnType<typeof calculateRosterPrice>>
type PricedUnit = Price['units'][number]

export const legacyIds = () => legacyRosterIds
export type LegacyIds = ReturnType<typeof legacyIds>

const add = (bag: Map<string, number>, key: string, n: number) => {
  const next = (bag.get(key) ?? 0) + n
  if (next) bag.set(key, next)
  else bag.delete(key)
}

/** A wargear ID as the named items it holds. */
export function leaves(definitions: VsDataDefinitions, id: string, n: number, into: Map<string, number>) {
  const inner = definitions.get('wargear', id)?.data.includes
  if (inner && Object.keys(inner).length) for (const [part, m] of Object.entries(inner)) leaves(definitions, part, n * m, into)
  else add(into, wargearKey(definitions.get('wargear', id)?.name ?? id).replace(ARTICLE, ''), n)
}

/**
 * The fewest VS Data option selections whose changes add up to `delta` and that VS Data's checker accepts for the unit,
 * or null when none do within the search budget.
 */
function selectionsFor(
  definitions: VsDataDefinitions,
  read: VsRosterUnit,
  delta: ReadonlyMap<string, number>,
): Record<string, Counts> | null {
  const moves = definitions.optionsOf(read.unit).flatMap((option) =>
    option.data.choices.map((choice) => {
      const change = new Map<string, number>()
      leaves(definitions, choice, 1, change)
      for (const [id, n] of Object.entries(option.data.replaces ?? {})) leaves(definitions, id, -n, change)
      return { option: option.id, choice, change }
    }),
  )
  const selectionsOf = (taken: typeof moves) => {
    const selections: Record<string, Counts> = {}
    for (const { option, choice } of taken) (selections[option] ??= {})[choice] = (selections[option]?.[choice] ?? 0) + 1
    return selections
  }
  const legal = (selections: Record<string, Counts>) => {
    let fine = true
    checkVsUnit(definitions, { ...read, options: selections }, (code) => {
      if (code.startsWith('option')) fine = false
    })
    return fine
  }
  let best: Record<string, Counts> | null = null
  let size = Infinity
  let budget = 200_000
  const walk = (from: number, rest: Map<string, number>, taken: typeof moves) => {
    if (budget-- < 0 || taken.length >= size) return
    if (!rest.size) {
      const selections = selectionsOf(taken)
      if (legal(selections)) {
        best = selections
        size = taken.length
      }
      return
    }
    for (let at = from; at < moves.length; at++) {
      const { change } = moves[at]!
      if (![...change].some(([key, n]) => n > 0 && (rest.get(key) ?? 0) > 0)) continue
      const next = new Map(rest)
      for (const [key, n] of change) add(next, key, -n)
      walk(at, next, [...taken, moves[at]!])
    }
  }
  walk(0, new Map(delta), [])
  return best
}

/** How many models of each name the built unit fields. */
export function modelsByName(selection: Selection, index: CatalogueIndex) {
  const found = new Map<string, number>()
  const walk = (node: Selection, carried: number) => {
    for (const child of node.selections ?? []) {
      const definition = index.definitions.get(child.id)
      const target = definition && resolve(definition, index)
      const count = (child.count ?? 1) * carried
      if (target?.type === 'model') add(found, same(definition?.name ?? target.name ?? ''), count)
      walk(child, target?.type === 'model' ? 1 : count)
    }
  }
  const root = index.definitions.get(selection.id)
  const target = root && resolve(root, index)
  if (target?.type === 'model') add(found, same(root?.name ?? target.name ?? ''), selection.count ?? 1)
  walk(selection, 1)
  return found
}

/** The VS Data model counts for a built unit of `total` models: by name where they tell, else fixed models and one variable. */
export function vsModels(definitions: VsDataDefinitions, unit: string, named: ReadonlyMap<string, number>, total: number) {
  const models = definitions.modelsOf(unit)
  const byName = new Map(models.map((model) => [same(model.name), model]))
  const counts: Record<string, number> = Object.fromEntries(models.map((model) => [model.id, 0]))
  let matched = 0
  for (const [name, count] of named) {
    const model = byName.get(name)
    if (!model) continue
    counts[model.id] = (counts[model.id] ?? 0) + count
    matched += count
  }
  if (matched === total) return counts
  const bounds = models.map((model) => ({ id: model.id, ...(model.data.bySize?.find((row) => row.size === total) ?? model.data) }))
  const variable = bounds.filter(({ min, max }) => min !== max)
  const fixed = bounds.filter(({ min, max }) => min === max).reduce((sum, { min }) => sum + min, 0)
  if (variable.length > 1) return null
  return Object.fromEntries(bounds.map((model) => [model.id, model === variable[0] ? total - fixed : model.min]))
}

export type ReadGap = { unit?: number; reason: string }

/**
 * A saved roster as a VS Data roster: its book, Detachments and datasheets through the frozen maps, and each unit's
 * models, wargear, Enhancement, Warlord and allegiance read from the unit Praetorium builds today, its wargear as the
 * fewest VS Data selections that give exactly the same items.
 */
export function vsRosterOf(
  input: PriceInput,
  price: Price,
  loaded: LoadedCatalogue,
  definitions: VsDataDefinitions,
  ids: LegacyIds,
  edition: string | null,
): { roster: VsRoster | null; keys?: number[]; gaps: ReadGap[] } {
  const key = (map: Record<string, string>, id: string) => (edition ? map[`${edition}~${id}`] : undefined) ?? map[id]
  const book = input.catalogueId.slice(input.catalogueId.indexOf('~') + 1)
  const faction = key(ids.books, book)
  const gaps: ReadGap[] = []
  if (!faction) return { roster: null, gaps: [{ reason: `book ${book} has no VS Data faction` }] }
  const detachments = input.detachmentIds.flatMap((id) => {
    const found = key(ids.detachments, id)
    if (!found) gaps.push({ reason: `detachment ${id} has no VS Data detachment` })
    return found ? [found] : []
  })
  const battleSize = definitions.all('battle-size').find((size) => size.data.points === input.limit)?.id
  const roster = [
    ...[battleSizeSelection(loaded.index, input.limit)].flatMap((selection) => (selection ? [selection] : [])),
    ...rosterDetachments(loaded, input.catalogueId, input.detachmentIds).selections,
  ]
  const keys: number[] = []
  const units = price.units.flatMap((priced): VsRosterUnit[] => {
    const pick = input.units[priced.key]!
    const unit = key(ids.units, pick.entryId)
    const at = priced.key
    if (!unit || !definitions.get('unit', unit)) {
      gaps.push({
        unit: at,
        reason: !unit
          ? `datasheet ${priced.name} has no VS Data unit`
          : definitions.unavailable.has(unit)
            ? `unit ${unit} is not in this rules version`
            : `unit ${unit} has no VS Data definition`,
      })
      return []
    }
    const built = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
      primaryCatalogueId: input.catalogueId,
      mustering: true,
      roster,
      spreads: pick.spreads,
      toggles: pick.toggles,
      floor: pick.floor,
    })
    if (!built) {
      gaps.push({ unit: at, reason: `${priced.name} does not build` })
      return []
    }
    const models = vsModels(definitions, unit, modelsByName(built.selection, loaded.index), priced.size.models)
    if (!models) gaps.push({ unit: at, reason: `${priced.name}: model counts unreadable` })
    const read: VsRosterUnit = { unit, ...(models ? { models } : {}) }
    const special = specialOf(priced, detachments, ids, key)
    if (special.enhancement) read.enhancement = special.enhancement
    for (const missing of special.missing)
      gaps.push({ unit: at, reason: `${priced.name}: enhancement ${missing} has no VS Data enhancement` })
    const allegiances = new Map(
      (definitions.get('unit', unit)!.data.allegiances ?? []).flatMap((offer) =>
        offer.choices.map((id) => [same(definitions.get('allegiance', id)?.name ?? id), id] as const),
      ),
    )
    const allegiance = priced.choices
      .flatMap((choice) => choice.options.filter((option) => option.count > 0).map((option) => allegiances.get(same(option.name))))
      .find(Boolean)
    if (allegiance) read.allegiance = allegiance
    if (hasWarlordToggle(priced.toggles)) {
      const characters = definitions.modelsOf(unit).filter((model) => model.data.max === 1)
      read.warlord = (characters.length === 1 ? characters[0] : definitions.modelsOf(unit)[0])?.id
    }
    const options = wargearSelections(definitions, read, built.selection, loaded.index, special.names)
    if (options === null) gaps.push({ unit: at, reason: `${priced.name}: wargear has no VS Data selections` })
    else if (Object.keys(options).length) read.options = options
    keys.push(at)
    return [read]
  })
  return { roster: { faction, detachments, ...(battleSize ? { battleSize } : {}), units }, keys, gaps }
}

/** The unit's Enhancement as VS Data names it, and the names of every special it holds, which are not wargear. */
export function specialOf(
  priced: PricedUnit,
  detachments: readonly string[],
  ids: LegacyIds,
  key: (map: Record<string, string>, id: string) => string | undefined,
) {
  const names = new Set([...priced.enhancements, ...priced.upgrades].map((name) => wargearKey(name)))
  const missing: string[] = []
  let enhancement: string | undefined
  for (const choice of priced.choices) {
    if (!('kind' in choice) || !choice.kind) continue
    for (const option of choice.options.filter((candidate) => candidate.count > 0)) {
      names.add(wargearKey(option.name))
      const found = detachments.map((detachment) => key(ids.enhancements, `${detachment}/${option.id}`)).find(Boolean)
      if (found) enhancement ??= found
      else missing.push(option.name)
    }
  }
  return { enhancement, names, missing }
}

/** The VS Data selections that give the built unit's wargear, Enhancements left out, against its models' own. */
function wargearSelections(
  definitions: VsDataDefinitions,
  read: VsRosterUnit,
  selection: Selection,
  index: CatalogueIndex,
  specials: ReadonlySet<string>,
) {
  const base = new Map<string, number>()
  const counts = read.models ?? {}
  for (const model of definitions.modelsOf(read.unit))
    for (const [id, n] of Object.entries(model.data.wargear)) leaves(definitions, id, n * (counts[model.id] ?? model.data.min), base)
  for (const [id, n] of Object.entries(definitions.get('unit', read.unit)?.data.wargear ?? {})) leaves(definitions, id, n, base)
  const known = new Set(base.keys())
  for (const option of definitions.optionsOf(read.unit))
    for (const choice of option.data.choices) {
      const into = new Map<string, number>()
      leaves(definitions, choice, 1, into)
      for (const name of into.keys()) known.add(name)
    }
  const bag = new Map<string, number>()
  for (const { name, count } of wargearOf(selection, index)) {
    if (specials.has(wargearKey(name))) continue
    add(bag, vsSpelling(name, known), count)
  }
  const delta = new Map(bag)
  for (const [name, n] of base) add(delta, name, -n)
  return delta.size ? selectionsFor(definitions, read, delta) : {}
}
