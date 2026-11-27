import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { vsDataConstructionSchema } from '../src/core/vsDataConstruction'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { unitSummaries } from '../src/shared/cataloguePicker'
import { inBook } from '../src/shared/vsDataPoints'
import { rosterParity } from './lib/vsDataRosterParity'

/**
 * Report-only: how list building on BSData compares with what each rules version's VS Data release gives.
 *
 * For the current rules version, per book: the datasheets the roster picker offers against the units VS Data admits to
 * a roster of its faction (own, parent's, allies'), each offered datasheet's listed price against VS Data's price for
 * its smallest size, and each Detachment's force disposition.
 *
 * For every saved roster, list fielded into a battle and sealed-event entry in a local list copy (`scripts/fetchProductionCopy.ts`,
 * or a `just rosters-fetch` snapshot), on its own rules version: the list read as a VS Data roster
 * (`scripts/lib/vsDataRosters.ts`), its points and each unit's against VS Data's, and the verdict of the checks VS Data's
 * checker replaces. Writes `data-dev/vs-data-parity.json`, which names lists by ID and their units by datasheet, so it
 * stays in `data-dev`, and prints counts.
 *
 *   pnpm exec tsx scripts/vsDataParity.ts [catalogue directory] [construction directory] [list copy]
 */
const directory = path.resolve(process.argv[2] ?? 'catalogue-data')
const constructionDirectory = path.resolve(process.argv[3] ?? path.join(directory, 'summaries'))
const rosterFile = path.resolve(
  process.argv[4] ??
    (fs.existsSync('data-dev/production-lists.ndjson.gz') ? 'data-dev/production-lists.ndjson.gz' : 'data-dev/production-rosters.json'),
)
const composition = readCatalogueComposition(directory)
const base = composition?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const constructionOf = (edition: string) =>
  vsDataConstructionSchema.parse(JSON.parse(fs.readFileSync(path.join(constructionDirectory, `${edition}.construction.json`), 'utf8')))
const construction = constructionOf(base.edition.id)
const ids = (name: string) =>
  z
    .object({ ids: z.record(z.string(), z.string()) })
    .parse(JSON.parse(fs.readFileSync(path.join(import.meta.dirname, `../catalogue/legacy-ids/${name}.json`), 'utf8'))).ids
const [books, units, detachments] = [ids('books'), ids('units'), ids('detachments')]

const factionSchema = z.object({
  parent: z.string().optional(),
  excludedUnits: z.array(z.string()).default([]),
  allies: z.array(z.object({ units: z.array(z.string()) })).default([]),
})
const unitSchema = z.object({ faction: z.string(), sizes: z.array(z.number()) })
const detachmentSchema = z.object({ dispositions: z.array(z.string()).default([]) })
const defs = construction.definitions
const vsUnits = new Map(Object.entries(defs.unit ?? {}).map(([id, { data }]) => [id, unitSchema.parse(data)]))
const pointsSchema = z.object({
  factions: z.array(
    z.object({
      units: z.array(
        z.object({
          id: z.string(),
          tiers: z.array(
            z.object({ copies: z.object({ from: z.number() }), costs: z.array(z.object({ models: z.number(), points: z.number() })) }),
          ),
        }),
      ),
    }),
  ),
})
const prices = new Map(
  construction.points.flatMap((snapshot) =>
    pointsSchema.parse(snapshot).factions.flatMap((faction) => faction.units.map((unit) => [unit.id, unit.tiers] as const)),
  ),
)

/** The units a roster of the faction may hold under VS Data: its own, its parent's but those it excludes, and its allies'. */
function admitted(faction: string) {
  const data = factionSchema.parse(defs.faction?.[faction]?.data ?? {})
  const own = [...vsUnits].filter(([, unit]) => unit.faction === faction || unit.faction === data.parent).map(([id]) => id)
  return new Set([...own.filter((id) => !data.excludedUnits.includes(id)), ...data.allies.flatMap((ally) => ally.units)])
}

const { catalogue, rules } = loadSnapshot(directory)
const report: Record<
  string,
  { faction: string; onlyBsdata: string[]; onlyVsData: string[]; unmapped: string[]; prices: string[]; dispositions: string[] }
> = {}
const totals = {
  books: 0,
  offered: 0,
  onlyBsdata: 0,
  onlyVsData: 0,
  unmapped: 0,
  priced: 0,
  priceDiffers: 0,
  detachments: 0,
  dispositionDiffers: 0,
}
for (const book of catalogue.factions) {
  const faction = books[book.id]
  if (!faction) continue
  totals.books++
  const offered = unitSummaries(catalogue, book.id, { factionCards: true, nonMatchedPlay: true }).get()
  const vs = admitted(faction)
  const unitOf = (id: string) => inBook(units, book.id, id)
  const mapped = new Map(
    offered.flatMap((unit) => {
      const id = unitOf(unit.id)
      return id ? [[id, unit] as const] : []
    }),
  )
  const row = {
    faction,
    onlyBsdata: [...mapped.keys()].filter((id) => !vs.has(id)).toSorted(),
    onlyVsData: [...vs].filter((id) => !mapped.has(id)).toSorted(),
    unmapped: offered
      .filter((unit) => !unitOf(unit.id))
      .map((unit) => unit.name)
      .toSorted(),
    prices: [] as string[],
    dispositions: [] as string[],
  }
  for (const [id, unit] of mapped) {
    const size = vsUnits.get(id)?.sizes[0]
    // A unit can cost differently by composition (in its own army or as an ally, in a named Detachment): any row at
    // the size that gives the listed price agrees.
    const points = (prices.get(id)?.find((tier) => tier.copies.from === 1)?.costs ?? [])
      .filter((cost) => cost.models === size)
      .map((cost) => cost.points)
    totals.priced++
    if (unit.points === null || !points.includes(unit.points))
      row.prices.push(`${unit.name}: ${unit.points} against ${points.join(' or ') || 'none'}`)
  }
  // A Detachment's force disposition: BSData's category against the disposition VS Data gives it (a pack member ID).
  for (const option of catalogue.detachments.get(book.id)?.options ?? []) {
    const record = detachments[option.id] && defs.detachment?.[detachments[option.id]!]
    if (!record) continue
    totals.detachments++
    const given = detachmentSchema.parse(record.data).dispositions.map((id) => id.slice(id.lastIndexOf('.') + 1))
    if (option.disposition ? !given.includes(option.disposition) : given.length > 0)
      row.dispositions.push(`${option.name}: ${option.disposition ?? 'none'} against ${given.join(', ') || 'none'}`)
  }
  totals.dispositionDiffers += row.dispositions.length
  totals.offered += offered.length
  totals.onlyBsdata += row.onlyBsdata.length
  totals.onlyVsData += row.onlyVsData.length
  totals.unmapped += row.unmapped.length
  totals.priceDiffers += row.prices.length
  report[book.name] = row
}
console.log(construction.release, totals)
const rosters = fs.existsSync(rosterFile)
  ? await rosterParity(directory, catalogue, rules, constructionOf, rosterFile, base.edition.id)
  : undefined
fs.mkdirSync('data-dev', { recursive: true })
fs.writeFileSync(
  'data-dev/vs-data-parity.json',
  `${JSON.stringify({ release: construction.release, totals, books: report, rosters }, null, 2)}\n`,
  { mode: 0o600 },
)
