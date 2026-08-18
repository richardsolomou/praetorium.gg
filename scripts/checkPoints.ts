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
import { buildIndex, type CatalogueFile, type SelectionEntry, targetOf } from '../src/core/catalogue'
import { evaluate, type Selection } from '../src/core/evaluate'
import { buildUnit, isResizable } from '../src/core/roster'

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

type MfmUnit = {
  name: string
  groupTitle?: string
  legends?: boolean
  pricing?: { range?: string; costs?: { models: number; points: number; addon?: boolean }[] }[]
  wargear?: { item: string; points: number }[]
}

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
const catalogueLinks = new Map(
  files.flatMap((file) => {
    const catalogue = file.catalogue ?? file.gameSystem
    return catalogue ? [[catalogue.id, (catalogue.catalogueLinks ?? []).map((link) => link.targetId)] as const] : []
  }),
)
const catalogueAliases: Record<string, string> = {
  'chaos-titan-legions': 'titanicus-traitoris',
  'imperial-agents': 'agents-of-the-imperium',
  'space-marines': 'adeptus-astartes',
  'titan-legions': 'adeptus-titanicus',
}

/** The Munitorum Title-Cases every name and uses curly apostrophes; the catalogues do neither. */
const normalise = (name: string) =>
  name
    .toLowerCase()
    .replaceAll('armour', 'armor')
    .replaceAll(/['’]/g, "'")
    .replaceAll(/\s+/g, ' ')
    .trim()

const isLegends = (entry: SelectionEntry) => /\[legends\]/i.test(entry.name ?? '')

const byName = new Map<string, SelectionEntry[]>()
const bySingularName = new Map<string, SelectionEntry[]>()
// Every datasheet any book offers, resolved through the link that offers it: the
// harness prices the entry itself, exactly as it did when the index held entries
// rather than the links to them.
const offered = new Set<string>()
for (const ids of index.datasheets.values())
  for (const id of ids) offered.add(targetOf(index.definitions.get(id) ?? { id }, index.definitions).id)

for (const id of offered) {
  const entry = index.definitions.get(id)
  if (!entry || !('type' in entry) || (entry.type !== 'unit' && entry.type !== 'model')) continue
  const key = normalise(entry.name ?? '')
  byName.set(key, [...(byName.get(key) ?? []), entry])
  const singular = key.endsWith('s') ? key.slice(0, -1) : key
  bySingularName.set(singular, [...(bySingularName.get(singular) ?? []), entry])
}

/**
 * The entries a Munitorum name could mean, preferring units over models.
 *
 * Most of the manual's entries are single-model characters and vehicles, which
 * the catalogues model as `model` rather than `unit`. Looking only for units
 * skipped two thirds of the game.
 */
function resolve(name: string, catalogueId?: string) {
  const key = normalise(name)
  const stripChaos = catalogueId && index.catalogues.get(catalogueId)?.name.includes('Titanicus Traitoris')
  const unprefixed = stripChaos && key.startsWith('chaos ') ? key.slice('chaos '.length) : key
  const all =
    byName.get(key) ??
    bySingularName.get(key.endsWith('s') ? key.slice(0, -1) : key) ??
    byName.get(unprefixed) ??
    bySingularName.get(unprefixed.endsWith('s') ? unprefixed.slice(0, -1) : unprefixed) ??
    []
  const distance = new Map<string, number>()
  const visit = (id: string, depth: number) => {
    if ((distance.get(id) ?? Number.POSITIVE_INFINITY) <= depth) return
    distance.set(id, depth)
    for (const linked of catalogueLinks.get(id) ?? []) visit(linked, depth + 1)
  }
  if (catalogueId) visit(catalogueId, 0)

  const nearest = Math.min(...all.map((entry) => distance.get(index.catalogueOf.get(entry.id) ?? '') ?? Number.POSITIVE_INFINITY))
  const scoped = Number.isFinite(nearest) ? all.filter((entry) => distance.get(index.catalogueOf.get(entry.id) ?? '') === nearest) : all
  let candidates = scoped.length ? scoped : all
  const primaryName = catalogueId ? index.catalogues.get(catalogueId)?.name : undefined
  if (primaryName && candidates.length > 1) {
    const affiliated = candidates.filter((entry) => {
      const owner = index.catalogues.get(index.catalogueOf.get(entry.id) ?? '')?.name
      return owner === primaryName || owner?.startsWith(`${primaryName} - `)
    })
    if (affiliated.length) candidates = affiliated
    else return []
  }
  if (candidates.length > 1) {
    const matchedPlay = candidates.filter((entry) => !hiddenOutsideCrusade(entry))
    if (matchedPlay.length) candidates = matchedPlay
  }
  const datasheets = candidates.filter((entry) => entry.type === 'unit')
  return datasheets.length ? datasheets : candidates.filter((entry) => entry.type === 'model')
}

/** A variant explicitly hidden when no Crusade force is present. */
function hiddenOutsideCrusade(entry: SelectionEntry) {
  return (entry.modifiers ?? []).some(
    (modifier) =>
      modifier.type === 'set' &&
      modifier.field === 'hidden' &&
      modifier.value === true &&
      (modifier.conditions ?? []).some(
        (condition) =>
          condition.type === 'lessThan' && condition.value === 1 && condition.field === 'forces' && condition.scope === 'roster',
      ),
  )
}

/** Separately priced wargear uses the quantities selected for the whole unit. */
function pricedWargearOf(selection: Selection) {
  const found = new Map<string, number>()
  const walk = (node: Selection) => {
    for (const child of node.selections ?? []) {
      const definition = index.definitions.get(child.id)
      const target = definition && 'targetId' in definition ? index.definitions.get(definition.targetId) : definition
      const grandchildren = child.selections ?? []
      if (target?.type === 'upgrade' && !grandchildren.length && target.name) {
        found.set(target.name, (found.get(target.name) ?? 0) + (child.count ?? 1))
      }
      walk(child)
    }
  }
  walk(selection)
  return found
}

const tally = { matched: 0, mismatched: 0, ambiguous: 0, missing: 0, unsupportedShape: 0 }
const missingSource = { legends: 0, active: 0 }
const mismatches: string[] = []
const skipped = { ambiguous: [] as string[], missing: [] as string[], unsupported: [] as string[] }
const census = new Set<string>()
let withoutCatalogue = 0
const unmatchedFactions: string[] = []
const wantedUnit = process.env.POINTS_UNIT?.toLowerCase()
const showSkipped = process.env.POINTS_SKIPS === '1'

for (const faction of factions) {
  // Chapter-specific surcharges ask which book the list is from, so the manual's
  // own faction file is what answers it.
  const primaryCatalogueId = catalogueBySlug.get(faction.slug) ?? catalogueBySlug.get(catalogueAliases[faction.slug] ?? '')
  if (!primaryCatalogueId && faction.units.length) {
    withoutCatalogue++
    unmatchedFactions.push(faction.slug)
  }
  for (const unit of faction.units) {
    if (wantedUnit && !unit.name.toLowerCase().includes(wantedUnit)) continue
    const unitCatalogueId =
      faction.slug === 'imperial-agents' && unit.groupTitle?.toLowerCase().includes('every model has the imperium keyword')
        ? catalogueBySlug.get('adeptus-astartes')
        : primaryCatalogueId
    const candidates = resolve(unit.name, primaryCatalogueId).filter((entry) => isLegends(entry) === Boolean(unit.legends))
    const tiers = (firstCopyRange(unit)?.costs ?? []).filter((cost) => !cost.addon)
    if (!tiers.length) continue
    if (!candidates.length) {
      tally.missing += tiers.length
      missingSource[unit.legends ? 'legends' : 'active'] += tiers.length
      skipped.missing.push(`${faction.slug}: ${unit.name} (${tiers.length} tiers, ${unit.legends ? 'Legends' : 'active'})`)
      continue
    }
    if (candidates.length > 1) {
      tally.ambiguous += tiers.length
      const owners = candidates.map((entry) => index.catalogues.get(index.catalogueOf.get(entry.id) ?? '')?.name ?? 'unknown')
      skipped.ambiguous.push(`${faction.slug}: ${unit.name} (${owners.join(', ')}, ${tiers.length} tiers)`)
      continue
    }

    const [entry] = candidates
    if (!entry) continue
    for (const tier of tiers) {
      // The app builds a unit the same way, through the same function, so this
      // number is about the evaluator rather than about this script's guesswork.
      const built = buildUnit(entry.id, index, tier.models, undefined, { primaryCatalogueId: unitCatalogueId })
      // The manual calls a fixed datasheet one priced model even when its
      // catalogue selection contains a required companion, such as Sir Hekhtur.
      const fixedDatasheet = built && tier.models === 1 && !isResizable(built.size)
      if (!built || (built.size.models !== tier.models && !fixedDatasheet)) {
        tally.unsupportedShape++
        skipped.unsupported.push(
          `${faction.slug}: ${unit.name} @ ${tier.models} models (${built ? `built ${built.size.models}` : 'could not build'})`,
        )
        continue
      }

      const result = evaluate([built.selection], index, { primaryCatalogueId: unitCatalogueId })
      const wargearPrices = new Map((unit.wargear ?? []).map((item) => [normalise(item.item), item.points]))
      const equipped = pricedWargearOf(built.selection)
      const expected =
        tier.points + [...equipped].reduce((total, [name, count]) => total + (wargearPrices.get(normalise(name)) ?? 0) * count, 0)
      for (const note of result.unhandled) census.add(note)
      if (result.points === expected) tally.matched++
      else if (
        tiers.some(
          (other) =>
            other !== tier &&
            other.models === tier.models &&
            other.points + [...equipped].reduce((total, [name, count]) => total + (wargearPrices.get(normalise(name)) ?? 0) * count, 0) ===
              result.points,
        )
      ) {
        tally.unsupportedShape++
        skipped.unsupported.push(`${faction.slug}: ${unit.name} @ ${tier.models} models (alternate composition not built)`)
      } else {
        tally.mismatched++
        mismatches.push(`${faction.slug}: ${unit.name} @ ${tier.models} models: got ${result.points}, Munitorum says ${expected}`)
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
console.log(`source-absent: ${missingSource.legends} Legends tiers, ${missingSource.active} active tiers`)
console.log(
  `${withoutCatalogue} of ${factions.length} faction files could not be matched to a catalogue, so their surcharges are unapplied`,
)
if (unmatchedFactions.length) console.log(`unmatched faction files: ${unmatchedFactions.join(', ')}`)

if (mismatches.length) {
  console.log(`\n## mismatches`)
  for (const line of mismatches) console.log(`  ${line}`)
}

if (showSkipped) {
  for (const [reason, lines] of Object.entries(skipped)) {
    console.log(`\n## skipped: ${reason}`)
    for (const line of lines) console.log(`  ${line}`)
  }
}

console.log(`\n## catalogue features the evaluator did not act on (${census.size})`)
for (const note of [...census].toSorted()) console.log(`  ${note}`)

const allowedUnhandled = new Set([
  'scope primary-catalogue without a catalogue to compare',
  // Imported links can carry a unit-scoped error from a sibling definition. The
  // condition fails closed because that unit is not an ancestor of this pick.
  'unresolved scope 212d-f302-aaaf-5c12',
  'unresolved scope 9e9c-bf4d-2d40-be82',
])
const unexpectedUnhandled = [...census].filter((note) => !allowedUnhandled.has(note))
if (unexpectedUnhandled.length) process.exitCode = 1
