import fs from 'node:fs'
import path from 'node:path'
import { isReferenceDatasheet, loadCatalogue, datasheetsOf } from '../src/server/catalogueIndex'
import { isMatchedPlayDatasheet } from '../src/server/cataloguePicker'
import { canonicalIdsFor } from '../src/server/externalReferences'
import { buildUnit } from '../src/core/roster'
import { unitChoices, isUnitCompositionChoice } from '../src/core/unitChoices'
import { optionWargear } from '../src/core/modelKinds'
import { nameOf, targetOf } from '../src/core/catalogue'
import { normalizedName, normalizedNameVariants } from '../src/core/name'
import { factionDirectories } from '../src/server/rulesSource'

/**
 * How much of what the catalogue lets a player choose 40kdc can also express.
 *
 * Counted per option rather than per unit: a unit holding one of its four choices
 * is not covered, and a per-unit tally cannot see the difference.
 */
const directory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const core = process.env.KDC_CORE ?? path.join(directory, 'rules', 'data', 'core')
const loaded = loadCatalogue(directory)
if (!loaded) throw new Error('catalogue data is unavailable')

const readJSON = <T>(at: string): T => JSON.parse(fs.readFileSync(at, 'utf8')) as T
/** The sources disagree on apostrophe glyphs and on hyphenation: "Wreckin’ ball" against "Wreckin' Ball". */
const comparable = (name: string) =>
  normalizedName(
    name
      .normalize('NFKC')
      .replaceAll(/[\u2018\u2019\u02bc]/g, "'")
      .replaceAll("'", '')
      .replaceAll(/[\u2010-\u2015\u2212-]/g, ' '),
  )

const english = (value: unknown): string =>
  typeof value === 'string' ? value : typeof (value as { en?: unknown })?.en === 'string' ? (value as { en: string }).en : ''

/**
 * The unit each BSData entry answers to, read from the checkout being measured rather than
 * from the synced snapshot: a unit records a reference for every book that prints it, and a
 * reference added since the snapshot is exactly the kind of gap this script is here to see.
 */
const unitByEntry = new Map<string, string>()
/** Every equipment name 40kdc can put on a model of this unit, however it says so. */
const offeredBy = new Map<string, Set<string>>()
/** Every model variant 40kdc names for this unit, which is a separate vocabulary from equipment. */
const variantsBy = new Map<string, Set<string>>()
for (const faction of factionDirectories(core)) {
  const at = (file: string) => path.join(core, faction, `${file}.json`)
  if (fs.existsSync(at('units'))) {
    for (const unit of readJSON<Record<string, any>[]>(at('units'))) {
      for (const reference of (unit.external_refs ?? []) as Record<string, unknown>[]) {
        if (reference.namespace === 'bsdata') unitByEntry.set(String(reference.id), String(unit.id))
      }
    }
  }
  // An item answers to its aliases as well as its name, an alias being the name another
  // source gives the same weapon.
  const equipment = new Map<string, string[]>()
  for (const file of ['weapons', 'wargear']) {
    if (!fs.existsSync(at(file))) continue
    for (const item of readJSON<Record<string, any>[]>(at(file))) {
      equipment.set(String(item.id), [english(item.name), ...((item.aliases ?? []) as string[])])
    }
  }
  const add = (unit: string, ids: unknown) => {
    const set = offeredBy.get(unit) ?? new Set<string>()
    for (const id of (ids ?? []) as string[]) {
      for (const name of equipment.get(id) ?? []) if (name) set.add(comparable(name))
    }
    offeredBy.set(unit, set)
  }
  if (fs.existsSync(at('wargear-options'))) {
    for (const option of readJSON<Record<string, any>[]>(at('wargear-options'))) {
      const unit = String(option.unit_id)
      add(unit, option.replacement)
      for (const choice of option.replacement_choice ?? []) add(unit, choice)
      add(unit, option.replaces)
    }
  }
  if (fs.existsSync(at('unit-compositions'))) {
    for (const composition of readJSON<Record<string, any>[]>(at('unit-compositions'))) {
      const unit = String(composition.unit_id)
      for (const model of composition.models ?? []) {
        add(unit, model.default_weapon_ids)
        const named = variantsBy.get(unit) ?? new Set<string>()
        named.add(comparable(english(model.name)))
        for (const variant of model.loadout_variants ?? []) {
          add(unit, variant.weapon_ids)
          named.add(comparable(english(variant.name)))
        }
        variantsBy.set(unit, named)
      }
    }
  }
}

/**
 * A Mark is a keyword granted by the Pactbound Zealots detachment rule, not equipment the
 * datasheet offers, so it is counted apart from what 40kdc cannot express: the rule is
 * already carried as a detachment, and no wargear entity is missing.
 */
const MARKS = new Set(['khorne', 'nurgle', 'slaanesh', 'tzeentch', 'chaos undivided'])

const edit = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 0; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length]![b.length]!
}

/**
 * The name 40kdc spells within two characters of this one, if it has one. A miss that
 * close is the same item under another spelling — "agonizer" against "agoniser" — which
 * is the sources disagreeing rather than 40kdc being unable to hold the option. Recording
 * the spelling as an alias on the 40kdc record is what settles one for good.
 */
const nearest = (offered: Set<string>, name: string): string | null => {
  const best = [...offered].map((candidate) => [edit(name, candidate), candidate] as const).toSorted((a, b) => a[0] - b[0])[0]
  return best && best[0] <= 2 ? best[1] : null
}

/**
 * Whether 40kdc can put this option on the unit. The catalogue writes a count into an
 * option's name and names a whole loadout in one option, where 40kdc names each item
 * once, so a name is tried whole, then stripped of its count, then split into its parts.
 */
const offers = (offered: Set<string>, name: string): boolean => {
  const one = (candidate: string) =>
    normalizedNameVariants(
      comparable(candidate)
        .replace(/^(\d+x?|one|two|three|four|five|six)\s+/, '')
        .replace(/^additional\s+/, '')
        .trim(),
    ).some((variant) => offered.has(variant))
  if (one(name)) return true
  // A loadout stated in one option — "cyclone missile launcher, storm bolter & power
  // fist", "dreadnought combat weapon w/ heavy flamer" — against 40kdc's one name apiece.
  const parts = name.split(/\s*,\s*|\s+(?:and|&|w\/|with)\s+/).filter((part) => part.trim())
  return parts.length > 1 && parts.every(one)
}

let units = 0
let marksTotal = 0
let optionsTotal = 0
let optionsCovered = 0
let optionsRespelled = 0
let modelsTotal = 0
let modelsCovered = 0
const missingByUnit = new Map<string, { faction: string; unit: string; missing: string[]; total: number }>()

for (const book of loaded.factions) {
  for (const entryId of datasheetsOf(loaded.index, book.id)) {
    const entry = loaded.index.definitions.get(entryId)
    if (!entry || !isMatchedPlayDatasheet(loaded.index, entry) || !isReferenceDatasheet(loaded, book.id, entryId)) continue
    const definitionId = targetOf(entry, loaded.index.definitions).id
    const unitId = unitByEntry.get(definitionId) ?? canonicalIdsFor(loaded.sourceReferences.units, 'bsdata', definitionId)[0]
    if (!unitId) continue
    const offered = offeredBy.get(unitId)
    if (!offered) continue
    const built = buildUnit(entryId, loaded.index, undefined, undefined, { primaryCatalogueId: book.id })
    if (!built) continue
    const choices = unitChoices(entryId, built.selection, loaded.index, { primaryCatalogueId: book.id })
    // A model option and a wargear option are answered by different parts of 40kdc,
    // so each is checked against the vocabulary that can hold it.
    const wantedModels = new Set<string>()
    /** Each option under its own name, against every name 40kdc could hold it by. */
    const wanted = new Map<string, string[]>()
    for (const choice of choices) {
      if (isUnitCompositionChoice(choice)) continue
      for (const option of choice.options) {
        // `profile` is absent on wargear and present-but-null on a model whose kind is unnamed.
        if (option.profile !== undefined) {
          wantedModels.add(comparable(option.name))
          continue
        }
        if (MARKS.has(comparable(option.name))) {
          marksTotal++
          continue
        }
        // Either name answers: the catalogue states a loadout in one option where 40kdc
        // names each piece, and names a drone's weapon where 40kdc names the drone.
        const label = comparable(option.name)
        const pieces = optionWargear(option.id, loaded.index, { primaryCatalogueId: book.id })
        wanted.set(label, [label, ...pieces.map((piece) => comparable(piece.name))])
      }
    }
    if (!wanted.size && !wantedModels.size) continue
    units++
    const named = variantsBy.get(unitId) ?? new Set<string>()
    // A model kind is named as 40kdc names it or by the loadout it carries, since a variant
    // matching the row's `default_weapon_ids` is that row rather than a variant beside it.
    const missingModels = [...wantedModels].filter(
      (name) => !normalizedNameVariants(name).some((variant) => named.has(variant)) && !offers(offered, name),
    )
    const missedWargear = [...wanted]
      .filter(([, candidates]) => !candidates.some((candidate) => offers(offered, candidate)))
      .map(([label]) => label)
    const respelled = missedWargear.filter((name) => nearest(offered, name))
    const missing = [
      ...missedWargear.filter((name) => !nearest(offered, name)).map((n) => `wargear:${n}`),
      ...missingModels.map((n) => `model:${n}`),
    ]
    modelsTotal += wantedModels.size
    modelsCovered += wantedModels.size - missingModels.length
    optionsTotal += wanted.size
    optionsCovered += wanted.size - missedWargear.length
    optionsRespelled += respelled.length
    if (process.argv.includes('--near')) {
      for (const name of respelled) console.log(`  spelling | ${unitId} | catalogue "${name}" vs 40kdc "${nearest(offered, name)}"`)
    }
    if (missing.length) {
      const name = nameOf(entry, loaded.index.definitions)
      missingByUnit.set(unitId, { faction: book.name, unit: name, missing, total: wanted.size + wantedModels.size })
    }
  }
}

const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : '—')
console.log(`units with choices and a 40kdc counterpart: ${units}`)
console.log(`options the catalogue offers:               ${optionsTotal}`)
console.log(`  40kdc can express:                        ${optionsCovered} (${pct(optionsCovered, optionsTotal)}%)`)
console.log(`  the same option spelled differently:      ${optionsRespelled}`)
console.log(`  missing:                                  ${optionsTotal - optionsCovered - optionsRespelled}`)
console.log(`model variants the catalogue offers:        ${modelsTotal}`)
console.log(`  40kdc names:                              ${modelsCovered} (${pct(modelsCovered, modelsTotal)}%)`)
console.log(`Marks of Chaos, granted by a detachment rather than offered as wargear: ${marksTotal}`)
console.log(`units with at least one missing option:     ${missingByUnit.size}`)
if (process.argv.includes('--details')) {
  const worst = [...missingByUnit.values()].toSorted((a, b) => b.missing.length - a.missing.length)
  for (const entry of worst.slice(0, Number(process.env.LIMIT ?? 25))) {
    console.log(
      `  ${entry.faction} | ${entry.unit} — ${entry.missing.length}/${entry.total} missing: ${entry.missing.slice(0, 6).join(', ')}`,
    )
  }
}
