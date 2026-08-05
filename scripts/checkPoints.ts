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
import { buildIndex, type CatalogueFile, type SelectionEntry } from '../src/core/catalogue'
import { evaluate } from '../src/core/evaluate'
import { buildUnit } from '../src/core/roster'

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

type MfmFaction = { slug?: string; units?: MfmUnit[] }

const factions = fs
  .readdirSync(pointsDirectory)
  .filter((name) => name.endsWith('.yaml'))
  .map((name) => {
    const faction: MfmFaction = parse(fs.readFileSync(path.join(pointsDirectory, name), 'utf8'))
    return { slug: faction.slug ?? name.replace('.yaml', ''), units: faction.units ?? [] }
  })

/** "Imperium - Blood Angels" is the same book the manual calls `blood-angels`. */
const slugOf = (catalogueName: string) =>
  catalogueName
    .split(' - ')
    .at(-1)!
    .toLowerCase()
    .replaceAll(/['’]/g, '')
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const catalogueBySlug = new Map<string, string>()
for (const catalogue of index.catalogues.values()) catalogueBySlug.set(slugOf(catalogue.name), catalogue.id)

/** The Munitorum Title-Cases every name and uses curly apostrophes; the catalogues do neither. */
const normalise = (name: string) =>
  name
    .toLowerCase()
    .replaceAll(/['’]/g, "'")
    .replaceAll(/\s+/g, ' ')
    .trim()

const byName = new Map<string, SelectionEntry[]>()
for (const [name, entries] of index.unitsByName) {
  const key = normalise(name)
  byName.set(key, [...(byName.get(key) ?? []), ...entries])
}

/**
 * The entries a Munitorum name could mean, preferring units over models.
 *
 * Most of the manual's entries are single-model characters and vehicles, which
 * the catalogues model as `model` rather than `unit`. Looking only for units
 * skipped two thirds of the game.
 */
function resolve(name: string) {
  const all = byName.get(normalise(name)) ?? []
  const datasheets = all.filter((entry) => entry.type === 'unit')
  return datasheets.length ? datasheets : all.filter((entry) => entry.type === 'model')
}

const tally = { matched: 0, mismatched: 0, ambiguous: 0, missing: 0, unsupportedShape: 0 }
const mismatches: string[] = []
const census = new Set<string>()
let withoutCatalogue = 0
const wantedUnit = process.env.POINTS_UNIT?.toLowerCase()

for (const faction of factions) {
  // Chapter-specific surcharges ask which book the list is from, so the manual's
  // own faction file is what answers it.
  const primaryCatalogueId = catalogueBySlug.get(faction.slug)
  if (!primaryCatalogueId) withoutCatalogue++
  for (const unit of faction.units) {
    if (wantedUnit && !unit.name.toLowerCase().includes(wantedUnit)) continue
    const candidates = resolve(unit.name)
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

    for (const tier of tiers) {
      // The app builds a unit the same way, through the same function, so this
      // number is about the evaluator rather than about this script's guesswork.
      const built = buildUnit(entry.id, index, tier.models, undefined, { primaryCatalogueId })
      if (!built || built.size.models !== tier.models) {
        tally.unsupportedShape++
        continue
      }

      const result = evaluate([built.selection], index, { primaryCatalogueId })
      for (const note of result.unhandled) census.add(note)
      if (result.points === tier.points) tally.matched++
      else {
        tally.mismatched++
        mismatches.push(`${unit.name} @ ${tier.models} models: got ${result.points}, Munitorum says ${tier.points}`)
        if (wantedUnit) console.log(JSON.stringify(built.selection, null, 2))
      }
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
console.log(
  `${withoutCatalogue} of ${factions.length} faction files could not be matched to a catalogue, so their surcharges are unapplied`,
)

if (mismatches.length) {
  console.log(`\n## mismatches`)
  for (const line of mismatches) console.log(`  ${line}`)
}

console.log(`\n## catalogue features the evaluator did not act on (${census.size})`)
for (const note of [...census].toSorted()) console.log(`  ${note}`)
