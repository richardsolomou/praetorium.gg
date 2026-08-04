/**
 * Checks the evaluator against Games Workshop's own numbers.
 *
 * For every unit in the Munitorum Field Manual, at every model count it prints a
 * price for, this builds that unit out of the community catalogue, evaluates it,
 * and compares. A disagreement means the evaluator is wrong — the Munitorum is
 * not a second opinion, it is the answer.
 *
 * It also prints the census of catalogue features the evaluator met and did not
 * act on, which is the honest measure of how far it has to go.
 */

import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'
import { buildIndex, type CatalogueFile, type CatalogueIndex, type Definition } from '../src/core/catalogue'
import { evaluate, type Selection } from '../src/core/evaluate'

const dataDirectory = process.env.CATALOGUE_DIR ?? path.join(import.meta.dirname, '..', 'catalogue-data')
const definitionsDirectory = path.join(dataDirectory, 'definitions')
const pointsDirectory = path.join(dataDirectory, 'points', 'data')

if (!fs.existsSync(definitionsDirectory)) {
  console.error(`no catalogue data at ${definitionsDirectory}. Run \`pnpm catalogue:sync\` first.`)
  process.exit(1)
}

const revision: { definitions: string } = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'revision.json'), 'utf8'))

const files: CatalogueFile[] = fs
  .readdirSync(definitionsDirectory)
  .filter((name) => name.endsWith('.json'))
  .map((name): CatalogueFile => JSON.parse(fs.readFileSync(path.join(definitionsDirectory, name), 'utf8')))

const index = buildIndex(files, revision.definitions)
console.log(`indexed ${index.definitions.size} definitions from ${files.length} files at ${revision.definitions.slice(0, 10)}\n`)

type MfmUnit = { name: string; pricing?: { range?: string; costs?: { models: number; points: number }[] }[] }

/**
 * The Munitorum prices a unit by which copy of it you are buying — "your 1st to
 * 2nd units cost", "your 3rd + unit costs". This harness builds exactly one copy,
 * so only the range that starts at 1 is a claim about what it built.
 */
const firstCopyRange = (unit: MfmUnit) =>
  (unit.pricing ?? []).find((pricing) => !pricing.range || /^\[1[,\]]/.test(pricing.range)) ?? (unit.pricing ?? [])[0]

const units: MfmUnit[] = fs
  .readdirSync(pointsDirectory)
  .filter((name) => name.endsWith('.yaml'))
  .flatMap((name) => {
    const faction: { units?: MfmUnit[] } = parse(fs.readFileSync(path.join(pointsDirectory, name), 'utf8'))
    return faction.units ?? []
  })

const isEntry = (definition: Definition) => definition.type !== undefined

/** Every child of a definition, with links followed to what they point at. */
function children(definition: Definition, catalogue: CatalogueIndex) {
  const found: { id: string; target: Definition }[] = []
  for (const child of definition.selectionEntries ?? []) found.push({ id: child.id, target: child })
  for (const group of definition.selectionEntryGroups ?? []) found.push({ id: group.id, target: group })
  for (const link of definition.entryLinks ?? []) {
    const target = catalogue.definitions.get(link.targetId)
    if (target) found.push({ id: link.id, target })
  }
  return found
}

type Slot = { path: string[] }

const sameGroup = (left: Slot, right: Slot) =>
  left.path.length === right.path.length && left.path.slice(0, -1).join('/') === right.path.slice(0, -1).join('/')

/** Where models can be placed under a unit, as a path of selection ids from the unit down. */
function modelSlots(unit: Definition, catalogue: CatalogueIndex): Slot[] {
  const slots: Slot[] = []
  const visit = (definition: Definition, trail: string[], depth: number) => {
    if (depth > 4) return
    for (const child of children(definition, catalogue)) {
      const next = [...trail, child.id]
      if (child.target.type === 'model') slots.push({ path: next })
      else if (!isEntry(child.target)) visit(child.target, next, depth + 1)
    }
  }
  visit(unit, [], 0)
  return slots
}

/** Merges assigned paths into one selection tree, so groups stay in the chain. */
function toSelection(unitId: string, assignments: { path: string[]; count: number }[]): Selection {
  const root: Selection & { selections: Selection[] } = { id: unitId, count: 1, selections: [] }
  for (const assignment of assignments) {
    let node = root
    assignment.path.forEach((id, depth) => {
      const last = depth === assignment.path.length - 1
      const existing = node.selections.find((child) => child.id === id)
      const child: Selection & { selections: Selection[] } = existing?.selections
        ? { ...existing, selections: existing.selections }
        : { id, count: last ? assignment.count : 1, selections: [] }
      if (!existing) node.selections.push(child)
      node = child
    })
  }
  return root
}

const tally = { matched: 0, mismatched: 0, ambiguous: 0, missing: 0, unsupportedShape: 0 }
const mismatches: string[] = []
const census = new Set<string>()

for (const unit of units) {
  const candidates = index.unitsByName.get(unit.name)?.filter((entry) => entry.type === 'unit') ?? []
  const tiers = firstCopyRange(unit)?.costs ?? []
  if (!tiers.length) continue
  if (!candidates.length) {
    tally.missing += tiers.length
    continue
  }
  if (candidates.length > 1) {
    tally.ambiguous += tiers.length
    continue
  }

  const [entry] = candidates
  if (!entry) continue
  const slots = modelSlots(entry, index)
  const [first, second] = slots

  for (const tier of tiers) {
    let assignments: { path: string[]; count: number }[]
    if (!first) {
      if (tier.models !== 1) {
        tally.unsupportedShape++
        continue
      }
      assignments = []
    } else if (slots.length === 1 || !second || sameGroup(first, second)) {
      // Slots sharing a parent are alternative loadouts of one squad, not a
      // leader and a squad, so the whole unit goes in the first of them.
      assignments = [{ path: first.path, count: tier.models }]
    } else {
      assignments = [{ path: first.path, count: 1 }]
      if (tier.models > 1) assignments.push({ path: second.path, count: tier.models - 1 })
    }

    const result = evaluate([toSelection(entry.id, assignments)], index)
    for (const note of result.unhandled) census.add(note)
    if (result.points === tier.points) tally.matched++
    else {
      tally.mismatched++
      if (mismatches.length < 25)
        mismatches.push(`${unit.name} @ ${tier.models} models: got ${result.points}, Munitorum says ${tier.points}`)
    }
  }
}

const checked = tally.matched + tally.mismatched
console.log(`## points, checked against the Munitorum Field Manual`)
console.log(`evaluated:  ${checked}`)
console.log(`matched:    ${tally.matched} (${checked ? ((tally.matched / checked) * 100).toFixed(1) : '0'}%)`)
console.log(`mismatched: ${tally.mismatched}`)
console.log(
  `\nskipped: ${tally.missing} not in the catalogue by that name, ${tally.ambiguous} ambiguous names, ${tally.unsupportedShape} unsupported shapes`,
)

if (mismatches.length) {
  console.log(`\n## first mismatches`)
  for (const line of mismatches) console.log(`  ${line}`)
}

console.log(`\n## catalogue features the evaluator did not act on (${census.size})`)
for (const note of [...census].toSorted()) console.log(`  ${note}`)
