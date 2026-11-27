/**
 * Reports, for a rules version's VS Data units, whether the builder's VS Data unit model (`src/core/vsDataUnit.ts`)
 * reaches only legal loadouts: the first fielding at every size, each choice taken alone, and each choice the frozen
 * options map gives a saved list's choice. Counts and unit names only.
 *
 *   pnpm exec tsx scripts/vsDataUnitParity.ts [--version mfm-1-6] [--list]
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import { legacyOptionsSchema } from '../src/core/legacyIds'
import { vsDataConstructionSchema, vsDataDefinitions } from '../src/core/vsDataConstruction'
import { modelBounds, type VsRosterUnit } from '../src/core/vsDataRoster'
import { vsFirstFielding, vsResized, vsUnitOptions, vsUnitProblems, vsWithChoice } from '../src/core/vsDataUnit'
import { catalogueDataDirectory } from './lib/catalogueFiles'

const { values } = parseArgs({ options: { version: { type: 'string', default: 'mfm-1-6' }, list: { type: 'boolean', default: false } } })
const file = path.join(catalogueDataDirectory(), 'summaries', `${values.version}.construction.json`)
const definitions = vsDataDefinitions(vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8'))))
const map = legacyOptionsSchema.parse(rawOptions)

const failures = new Map<string, Map<string, string[]>>()
const fail = (check: string, unit: string, detail: string) => {
  const byUnit = failures.get(check) ?? new Map<string, string[]>()
  failures.set(check, byUnit)
  byUnit.set(unit, [...(byUnit.get(unit) ?? []), detail])
}
const codes = (picked: VsRosterUnit) => vsUnitProblems(definitions, picked).map((problem) => problem.code)

let units = 0
for (const unit of definitions.all('unit')) {
  if (definitions.unavailable.has(unit.id)) continue
  units++
  const first = vsFirstFielding(definitions, unit.id)
  const firstProblems = codes(first)
  if (firstProblems.length) fail('first fielding', unit.id, firstProblems.join(' '))
  for (const size of unit.data.sizes) {
    const problems = codes(vsResized(definitions, first, size))
    if (problems.length) fail('resized', unit.id, `${size}: ${problems.join(' ')}`)
  }
  if (firstProblems.length) continue
  // From its largest size with every option full and spread over its choices, a resize to the smallest cuts no
  // selection it could keep: none it cut can be taken back.
  let full = vsResized(definitions, first, Math.max(...unit.data.sizes))
  for (const option of vsUnitOptions(definitions, full)) {
    if (!option.open || option.uniform) continue
    const counts: Record<string, number> = Object.fromEntries(option.choices.map((choice) => [choice.id, choice.count]))
    for (let left = option.bounds.max - option.taken, at = 0; left > 0 && option.choices.length; at++) {
      const choice = option.choices[at % option.choices.length]!
      const next = vsWithChoice(definitions, full, option.id, { ...counts, [choice.id]: (counts[choice.id] ?? 0) + 1 })
      if (at >= option.choices.length * option.bounds.max) break
      if (codes(next).length) continue
      counts[choice.id] = (counts[choice.id] ?? 0) + 1
      left--
    }
    full = vsWithChoice(definitions, full, option.id, counts)
  }
  const small = vsResized(definitions, full, Math.min(...unit.data.sizes))
  for (const option of vsUnitOptions(definitions, small))
    for (const choice of option.choices) {
      const before = full.options?.[option.id]?.[choice.id] ?? 0
      if (option.uniform || choice.count >= before) continue
      const back = vsWithChoice(definitions, small, option.id, {
        ...Object.fromEntries(option.choices.map((other) => [other.id, other.count])),
        [choice.id]: choice.count + 1,
      })
      if (!codes(back).length) fail('resize cut', unit.id, `${option.id} ${choice.id}: ${choice.count} of ${before} kept`)
    }
  for (const option of vsUnitOptions(definitions, first)) {
    if (!option.open) continue
    for (const choice of option.choices) {
      const counts = Object.fromEntries(option.choices.map((other) => [other.id, other.count]))
      const substitute = option.substitutes.includes(choice.id)
      if (option.uniform && !substitute) {
        // All of one choice, beside whatever substitutes are taken.
        for (const other of option.choices) if (!option.substitutes.includes(other.id)) counts[other.id] = 0
        counts[choice.id] = option.bounds.max - option.substitutes.reduce((sum, id) => sum + (counts[id] ?? 0), 0)
      } else if (option.taken >= option.bounds.max) {
        // At its maximum, the option gives up one of its most-taken other choice, as the builder swaps it.
        const donor = option.choices.filter((other) => other.id !== choice.id && other.count > 0).toSorted((a, b) => b.count - a.count)[0]
        if (!donor) continue
        counts[donor.id] = donor.count - 1
        counts[choice.id] = choice.count + 1
      } else {
        if (choice.most <= choice.count) continue
        counts[choice.id] = choice.count + 1
      }
      const problems = codes(vsWithChoice(definitions, first, option.id, counts))
      if (problems.length) fail('one choice', unit.id, `${option.id} ${choice.id}: ${problems.join(' ')}`)
    }
  }
}

let mapped = 0
for (const [entryId, entry] of Object.entries(map.units)) {
  if (!definitions.get('unit', entry.unit) || entry.base === 'unmatched') continue
  // The map's `base` turns VS Data's bare first fielding, its defaults alone, into BSData's.
  const unit = definitions.get('unit', entry.unit)!
  const smallest = Math.min(...unit.data.sizes)
  const models = Object.fromEntries(
    definitions.modelsOf(unit.id).map((model) => [model.id, unit.data.defaultModels?.[model.id] ?? modelBounds(model.data, smallest).min]),
  )
  let start: VsRosterUnit = { unit: unit.id, models, options: structuredClone(unit.data.defaults ?? {}) }
  for (const [option, counts] of Object.entries(entry.base?.options ?? {}))
    start = vsWithChoice(definitions, start, option, addCounts(start.options?.[option] ?? {}, counts))
  if (codes(start).length) {
    fail('mapped base', entry.unit, `${entryId}: ${codes(start).join(' ')}`)
    continue
  }
  for (const [key, choice] of Object.entries(entry.choices)) {
    if (!('options' in choice) || !Object.keys(choice.options).length) continue
    mapped++
    let taken = start
    for (const [option, counts] of Object.entries(choice.options))
      taken = vsWithChoice(definitions, taken, option, addCounts(taken.options?.[option] ?? {}, counts))
    const problems = codes(taken)
    if (problems.length) fail('mapped choice', entry.unit, `${key}: ${problems.join(' ')}`)
  }
}

function addCounts(held: Readonly<Record<string, number>>, change: Readonly<Record<string, number>>) {
  const next = { ...held }
  for (const [wargear, n] of Object.entries(change)) next[wargear] = (next[wargear] ?? 0) + n
  return next
}

console.log(`${values.version}: ${units} units, ${mapped} mapped choices`)
for (const [check, byUnit] of failures) {
  console.log(`  ${check}: ${byUnit.size} units, ${[...byUnit.values()].reduce((sum, list) => sum + list.length, 0)} cases`)
  if (values.list) for (const [unit, details] of byUnit) console.log(`    ${unit}: ${details.slice(0, 3).join(' | ')}`)
}
