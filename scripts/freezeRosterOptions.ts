import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { type CatalogueIndex, targetOf } from '../src/core/catalogue'
import { buildUnit, type BuiltUnit } from '../src/core/roster'
import { isUnitCompositionChoice, type UnitChoice } from '../src/core/unitChoices'
import { wargearOf } from '../src/core/wargear'
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { wargearKey } from '../src/core/wargearNames'
import { editionDirectory, readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadCatalogue } from '../src/server/catalogueIndex'

/**
 * Writes `catalogue/legacy-ids/options.json`: for each datasheet a saved roster can hold, the VS Data selections each of
 * its BSData choices stands for. A choice's selections are the fewest VS Data option selections whose wargear changes
 * equal exactly what the choice changes on the BSData-built unit, against the unit as first fielded. A choice no
 * selection reproduces is listed under `unmatched`, never approximated.
 *
 *   pnpm exec tsx scripts/freezeRosterOptions.ts <catalogue directory> <directory of unpacked releases, one per rules version>
 */
const [catalogueDirectory, releases] = process.argv.slice(2)
if (!catalogueDirectory || !releases)
  throw new Error('Usage: tsx scripts/freezeRosterOptions.ts <catalogue directory> <releases directory>')

/** Reviewed spellings: wargear as VS Data names it, by BSData's name, both as `wargearKey`s, read only for a unit without BSData's. */
const SPELLINGS: Record<string, string> = {
  'absolver-bolt-pistol': 'absolvor-bolt-pistol',
  'adrathic-combi-destructors': 'adrathic-combi-destructor',
  agonizer: 'agoniser',
  'astartes-chainsword': 'chainsword',
  'cavalry-sabre-clawed-limbs': 'cavalry-sabre-and-clawed-limbs',
  'channeler-stones': 'channeller-stones',
  'chirugeons-tools': 'chirurgeons-tools',
  'death-korps-of-krieg-medi-pack': 'death-korps-medi-pack',
  'distendible-jaw': 'distensible-jaw',
  'exo-armour-grenade-launcher': 'exoarmour-grenade-launcher',
  'grav-chute': 'grav-chutes',
  'improvised-weapons': 'improvised-weapon',
  'kratos-battlecannon': 'kratos-battle-cannon',
  'lancer-laser-destroyer': 'laser-destroyer',
  'lashing-tongues': 'lashing-tongue',
  'lastrum-storm-bolters': 'lastrum-storm-bolter',
  'magma-cutter': 'magma-cutters',
  'nuncio-aquila': 'nuncio-acquila',
  'pan-spectral-scanner': 'panspectral-scanner',
  'relic-great-axe': 'relic-greataxe',
  spinemaw: 'spinemaws',
  'sporocyst-bio-weapon': 'sporocyst-bio-weapons',
  'squig-jaws': 'squigs-jaws',
  'staff-of-ulthamar-and-witchblade': 'the-staff-of-ulthamar-and-witchblade',
  'steeds-savage-claws': 'savage-claws',
  'termagant-spinefist': 'termagant-spinefists',
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
type VsUnit = {
  id: string
  models: { id: string; min: number; max: number; wargear: Counts }[]
  options: VsOption[]
  wargear: Counts
  defaults: Record<string, Counts>
  defaultModels: Counts
  sizes: number[]
  /** Each allegiance the unit may take, by its name as `same` reads it. */
  allegiances: Map<string, string>
}
type VsOption = { id: string; choices: string[]; replaces: Counts }

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
      models: [],
      options: [],
      wargear: (data.wargear ?? {}) as Counts,
      defaults: (data.defaults ?? {}) as Record<string, Counts>,
      defaultModels: (data.defaultModels ?? {}) as Counts,
      sizes: data.sizes as number[],
      allegiances: new Map(
        ((data.allegiances ?? []) as { choices: string[] }[]).flatMap((offer) =>
          offer.choices.map((choice) => [same(names.get(choice) ?? choice), choice] as const),
        ),
      ),
    })
  for (const { id, data } of byKind.get('model') ?? [])
    units.get(data.unit as string)?.models.push({ id, min: data.min as number, max: data.max as number, wargear: data.wargear as Counts })
  for (const { id, data } of byKind.get('roster-option') ?? [])
    units.get(data.unit as string)?.options.push({ id, choices: data.choices as string[], replaces: (data.replaces ?? {}) as Counts })
  /** A wargear ID as the named items it holds, keyed as `wargearKey` reads a name. */
  const leaves = (id: string, n: number, into: Map<string, number>) => {
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

const add = (bag: Map<string, number>, key: string, n: number) => {
  const next = (bag.get(key) ?? 0) + n
  if (next) bag.set(key, next)
  else bag.delete(key)
}

type Release = ReturnType<typeof readRelease>

/** What a VS Data unit carries when first fielded at its smallest size, as named items. */
function vsBase(release: Release, unit: VsUnit) {
  const bag = new Map<string, number>()
  for (const model of unit.models)
    for (const [id, n] of Object.entries(model.wargear)) release.leaves(id, n * (unit.defaultModels[model.id] ?? model.min), bag)
  for (const [id, n] of Object.entries(unit.wargear)) release.leaves(id, n, bag)
  for (const selections of Object.values(unit.defaults)) for (const [id, n] of Object.entries(selections)) release.leaves(id, n, bag)
  return bag
}

/** The VS Data selections, as option → wargear → count, whose changes add up to `delta`: the fewest, or none. */
function selectionsFor(release: Release, unit: VsUnit, delta: ReadonlyMap<string, number>) {
  const moves = unit.options.flatMap((option) =>
    option.choices.map((choice) => {
      const change = new Map<string, number>()
      release.leaves(choice, 1, change)
      for (const [id, n] of Object.entries(option.replaces)) release.leaves(id, -n, change)
      return { option: option.id, choice, change }
    }),
  )
  let best: typeof moves | null = null
  let budget = 20000
  const walk = (from: number, rest: Map<string, number>, taken: typeof moves) => {
    if (budget-- < 0 || (best && taken.length >= best.length)) return
    if (!rest.size) {
      best = taken
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
  if (!best) return null
  const selections: Record<string, Counts> = {}
  for (const { option, choice } of best as typeof moves) (selections[option] ??= {})[choice] = (selections[option]?.[choice] ?? 0) + 1
  return selections
}

/** What a BSData-built unit carries, as named items in VS Data's spelling, leaving out Enhancements. */
function bsdataBag(built: BuiltUnit, index: CatalogueIndex, vsKeys: ReadonlySet<string>, enhancements: ReadonlySet<string>) {
  const bag = new Map<string, number>()
  for (const { name, count } of wargearOf(built.selection, index)) {
    let key = wargearKey(name).replace(ARTICLE, '')
    if (enhancements.has(key)) continue
    if (!vsKeys.has(key)) key = SPELLINGS[key] ?? key
    add(bag, key, count)
  }
  return bag
}

const difference = (after: ReadonlyMap<string, number>, before: ReadonlyMap<string, number>) => {
  const delta = new Map(after)
  for (const [key, n] of before) add(delta, key, -n)
  return delta
}

const unitsMap = z
  .object({ ids: z.record(z.string(), z.string()) })
  .parse(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../catalogue/legacy-ids/units.json'), 'utf8'))).ids
const enhancementsMap = z
  .object({ ids: z.record(z.string(), z.string()) })
  .parse(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../catalogue/legacy-ids/enhancements.json'), 'utf8'))).ids
const composition = readCatalogueComposition(catalogueDirectory)
if (!composition) throw new Error(`${catalogueDirectory} has no catalogue composition`)

/** A choice is VS Data option selections, as option → wargear → count, or the allegiance the unit takes. */
type Translation = { options: Record<string, Counts> } | { allegiance: string }
type UnitOptions = { unit: string; choices: Record<string, Translation>; unmatched: string[] }
const out: Record<string, UnitOptions> = {}
const debug: string[] = []
const tally = { units: 0, choices: 0, same: 0, matched: 0, allegiances: 0, unmatched: 0, defaultsDiffer: 0 }
for (const entry of composition.editions.filter((candidate) => candidate.base)) {
  const release = readRelease(path.join(releases, entry.edition.id))
  const loaded = loadCatalogue(editionDirectory(catalogueDirectory, entry), entry.edition)
  if (!loaded) throw new Error(`${entry.edition.id} has no catalogue`)
  const { index } = loaded
  const enhancementIds = new Set(Object.keys(enhancementsMap).map((key) => key.slice(key.lastIndexOf('/') + 1)))
  const enhancementNames = new Set(
    [...enhancementIds].flatMap((id) => {
      const definition = index.definitions.get(id)
      return definition ? [wargearKey(targetOf(definition, index.definitions).name ?? '')] : []
    }),
  )
  for (const [entryId, unitId] of Object.entries(unitsMap)) {
    if (entryId.includes('~')) continue
    const unit = release.units.get(unitId)
    if (!unit || !index.definitions.has(entryId)) continue
    const base = buildUnit(entryId, index)
    if (!base) continue
    tally.units++
    const vsKeys = new Set([
      ...vsBase(release, unit).keys(),
      ...unit.options.flatMap((option) =>
        option.choices.flatMap((choice) => {
          const into = new Map<string, number>()
          release.leaves(choice, 1, into)
          return [...into.keys()]
        }),
      ),
    ])
    const bagOf = (built: BuiltUnit) => bsdataBag(built, index, vsKeys, enhancementNames)
    const baseBag = bagOf(base)
    if (difference(baseBag, vsBase(release, unit)).size && base.size.models === (unit.sizes[0] ?? 0)) tally.defaultsDiffer++
    const result: UnitOptions = { unit: unitId, choices: {}, unmatched: [] }
    // A choice is read against the unit it is made on: the first fielding, or a parent choice's unit for one it opens.
    const visit = (from: BuiltUnit, made: Readonly<Record<string, string>>, depth: number) => {
      const fromBag = bagOf(from)
      for (const choice of from.choices) {
        if (isUnitCompositionChoice(choice) || made[choice.key]) continue
        for (const option of choice.options) {
          if (enhancementIds.has(option.id) || option.id === choice.chosen) continue
          const key = `${choice.key}|${option.id}`
          if (key in result.choices || result.unmatched.includes(key)) continue
          tally.choices++
          const allegiance = unit.allegiances.get(same(option.name))
          if (allegiance) {
            tally.allegiances++
            result.choices[key] = { allegiance }
            continue
          }
          const built = chosen(entryId, index, made, choice, option.id)
          if (!built) continue
          // A loadout that brings a model of its own is read against the unit at the size it gives.
          const reference = built.size.models > from.size.models ? buildUnit(entryId, index, built.size.models, made) : from
          const delta = difference(bagOf(built), reference ? bagOf(reference) : fromBag)
          const selections = delta.size ? selectionsFor(release, unit, delta) : {}
          if (!delta.size) tally.same++
          if (selections) {
            if (delta.size) tally.matched++
            result.choices[key] = { options: selections }
            if (depth < 2 && choice.room === 1) visit(built, { ...made, [choice.key]: option.id }, depth + 1)
          } else {
            tally.unmatched++
            if (process.env.OPTIONS_DEBUG)
              debug.push(
                `${unitId}\t${choice.name}: ${choice.options.find((o) => o.id === option.id)?.name}\t${JSON.stringify(Object.fromEntries(delta))}`,
              )
            result.unmatched.push(key)
          }
        }
      }
    }
    visit(base, {}, 0)
    out[entryId] = result
  }
}

/** The unit with one more choice made: the option taken, or for a group the squad divides, one more of it. */
function chosen(entryId: string, index: CatalogueIndex, made: Readonly<Record<string, string>>, choice: UnitChoice, optionId: string) {
  if (choice.room === 1) return buildUnit(entryId, index, undefined, { ...made, [choice.key]: optionId })
  const given = choice.options.find((option) => option.id !== optionId && option.count > 0)
  const taking = choice.options.find((option) => option.id === optionId)!
  return buildUnit(entryId, index, undefined, made, {
    spreads: { [choice.key]: { ...(given ? { [given.id]: given.count - 1 } : {}), [optionId]: taking.count + 1 } },
  })
}

console.log(tally)
if (process.env.OPTIONS_DEBUG) fs.writeFileSync(process.env.OPTIONS_DEBUG, debug.join('\n'))
// Frozen like the other maps: a choice keeps the selections it was first given, and this run only adds.
const file = path.join(import.meta.dirname, '../catalogue/legacy-ids/options.json')
const frozen = fs.existsSync(file) ? legacyOptionsSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))).units : {}
for (const [entryId, held] of Object.entries(frozen)) {
  const found = out[entryId]
  if (found && found.unit !== held.unit) throw new Error(`options: ${entryId} is frozen for ${held.unit}; this run names ${found.unit}`)
  const choices = { ...held.choices }
  for (const [key, selections] of Object.entries(found?.choices ?? {})) {
    if (key in choices && JSON.stringify(choices[key]) !== JSON.stringify(selections))
      throw new Error(
        `options: ${entryId} ${key} is frozen as ${JSON.stringify(choices[key])}; this run names ${JSON.stringify(selections)}`,
      )
    choices[key] = selections
  }
  const unmatched = [...new Set([...held.unmatched, ...(found?.unmatched ?? [])])].filter((key) => !(key in choices)).toSorted()
  out[entryId] = { unit: held.unit, choices, unmatched }
}
fs.writeFileSync(
  file,
  `${JSON.stringify({ format: 'praetorium.legacy-options.v1', units: Object.fromEntries(Object.entries(out).toSorted(([a], [b]) => (a < b ? -1 : 1))) }, null, 2)}\n`,
)
