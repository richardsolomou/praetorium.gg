import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type CatalogueIndex, resolve } from '../../src/core/catalogue'
import { battleSizeSelection, evaluate, type Selection } from '../../src/core/evaluate'
import { buildUnit } from '../../src/core/roster'
import { hasWarlordToggle } from '../../src/core/unitChoices'
import { wargearOf } from '../../src/core/wargear'
import { wargearKey } from '../../src/core/wargearNames'
import { ARTICLE, vsSpelling } from '../../src/shared/wargearSpellings'
import { same } from '../../src/shared/vsDataModelNames'
import { vsModels } from '../../src/shared/importedVsPicks'
import type { Counts, VsDataDefinitions } from '../../src/core/vsDataConstruction'
import { checkVsUnit, type VsRoster, type VsRosterUnit } from '../../src/core/vsDataRoster'
import type { LoadedCatalogue } from '../../src/shared/catalogueIndex'
import { calculateRosterPrice } from '../../src/shared/pricing'
import { rosterDetachments } from '../../src/shared/rosterDetachments'
import type { PriceInput } from '../../src/contracts/schemas'

type Price = NonNullable<ReturnType<typeof calculateRosterPrice>>
type PricedUnit = Price['units'][number]

const mapSchema = z.object({ ids: z.record(z.string(), z.string()), allegiances: z.record(z.string(), z.string()).optional() })
const mapOf = (name: string) =>
  mapSchema.parse(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, `../../catalogue/legacy-ids/${name}.json`), 'utf8')))
export const legacyIds = () => {
  const units = mapOf('units')
  return {
    books: mapOf('books').ids,
    detachments: mapOf('detachments').ids,
    units: units.ids,
    /** The allegiance a datasheet's own identity implies (one Soul Grinder datasheet per god), keyed as `units` is. */
    unitAllegiances: units.allegiances ?? {},
    enhancements: mapOf('enhancements').ids,
  }
}
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

/** The named items a VS Data unit carries: its models' and its own wargear, changed by the options it takes. */
export function vsWargear(definitions: VsDataDefinitions, read: VsRosterUnit) {
  const bag = new Map<string, number>()
  const counts = read.models ?? {}
  for (const model of definitions.modelsOf(read.unit))
    for (const [id, n] of Object.entries(model.data.wargear)) leaves(definitions, id, n * (counts[model.id] ?? model.data.min), bag)
  for (const [id, n] of Object.entries(definitions.get('unit', read.unit)?.data.wargear ?? {})) leaves(definitions, id, n, bag)
  for (const [optionId, chosen] of Object.entries(read.options ?? {})) {
    const replaces = definitions.get('roster-option', optionId)?.data.replaces ?? {}
    for (const [choice, n] of Object.entries(chosen)) {
      leaves(definitions, choice, n, bag)
      for (const [id, m] of Object.entries(replaces)) leaves(definitions, id, -m * n, bag)
    }
  }
  return bag
}

/** Every named item a VS Data unit can carry, which the reviewed spellings read BSData's names against. */
export function vsKnownWargear(definitions: VsDataDefinitions, unit: string) {
  const known = new Set(
    vsWargear(definitions, { unit, models: Object.fromEntries(definitions.modelsOf(unit).map((model) => [model.id, 1])) }).keys(),
  )
  for (const option of definitions.optionsOf(unit))
    for (const choice of option.data.choices) {
      const into = new Map<string, number>()
      leaves(definitions, choice, 1, into)
      for (const name of into.keys()) known.add(name)
    }
  return known
}

/** What the catalogue's own checks report of one built unit in its roster, beyond what they report of the roster alone. */
export function catalogueUnitErrors(index: CatalogueIndex, roster: readonly Selection[], primaryCatalogueId: string, unit: Selection) {
  const said = (selections: readonly Selection[]) =>
    evaluate(selections, index, { primaryCatalogueId }).errors.map((error) => `${error.entryName} ${error.message}`)
  const before = new Set(said(roster))
  return said([...roster, unit]).filter((error) => !before.has(error))
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
    const unit = key(ids.units, `${book}/${pick.entryId}`) ?? key(ids.units, pick.entryId)
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

/** The unit's Enhancement and Detachment upgrades as VS Data names them, and the names of every special it holds, which are not wargear. */
export function specialOf(
  priced: PricedUnit,
  detachments: readonly string[],
  ids: LegacyIds,
  key: (map: Record<string, string>, id: string) => string | undefined,
) {
  const names = new Set([...priced.enhancements, ...priced.upgrades].map((name) => wargearKey(name)))
  const missing: string[] = []
  const enhancements: string[] = []
  for (const choice of priced.choices) {
    if (!('kind' in choice) || !choice.kind) continue
    for (const option of choice.options.filter((candidate) => candidate.count > 0)) {
      names.add(wargearKey(option.name))
      const found = detachments.map((detachment) => key(ids.enhancements, `${detachment}/${option.id}`)).find(Boolean)
      if (found) enhancements.push(found)
      else missing.push(option.name)
    }
  }
  return { enhancement: enhancements[0], enhancements, names, missing }
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
