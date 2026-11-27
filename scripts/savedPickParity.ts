import fs from 'node:fs'
import path from 'node:path'
import { battleSizeSelection } from '../src/core/evaluate'
import { buildUnit } from '../src/core/roster'
import { savedPickTranslations, withVsLoadout, withVsPicks } from '../src/core/savedPicks'
import { wargearOf } from '../src/core/wargear'
import { wargearKey } from '../src/core/wargearNames'
import { vsDataConstructionSchema, vsDataDefinitions, type VsDataDefinitions } from '../src/core/vsDataConstruction'
import { checkVsUnit, priceVsRoster, type VsRosterUnit } from '../src/core/vsDataRoster'
import { readCatalogueComposition } from '../src/server/catalogueComposition'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { calculateRosterPrice, savedRosterPriceInput } from '../src/shared/pricing'
import { rosterDetachments } from '../src/shared/rosterDetachments'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { type SavedList, savedLists, savedLoadouts } from './lib/vsDataRosterParity'
import { catalogueUnitErrors, legacyIds, specialOf, vsKnownWargear, vsWargear } from './lib/vsDataRosters'
import { same } from '../src/shared/vsDataModelNames'
import { vsSpelling } from '../src/shared/wargearSpellings'

/**
 * The saved-pick gate, report-only: every list and unit loadout in a local production copy priced and checked as Praetorium does today
 * and again with each pick the frozen translations (`data-dev/saved-picks.json`, from `scripts/translateSavedPicks.ts`)
 * read as its `VsPick`, through VS Data's `priceVsRoster` and `checkVsUnit`. Per translated unit it compares the points,
 * the model count, the wargear (through the reviewed spellings, Enhancements and allegiances left out), and the
 * verdict: whether VS Data's `checkVsUnit` accepts it against whether the catalogue's own checks of the unit do. Per
 * list it compares the translated units' points. The list's verdict through VS Data's checker is the legality gate's. Prints counts by kind and rules version; writes the differing units to
 * `data-dev/saved-pick-parity.ndjson`, which names lists by ID, so it stays in `data-dev`.
 *
 *   pnpm exec tsx scripts/savedPickParity.ts [catalogue directory] [list copy] [translations]
 */
const directory = path.resolve(process.argv[2] ?? 'catalogue-data')
const listFile = path.resolve(process.argv[3] ?? 'data-dev/production-lists.ndjson.gz')
const translationOf = savedPickTranslations(
  JSON.parse(fs.readFileSync(path.resolve(process.argv[4] ?? 'data-dev/saved-picks.json'), 'utf8')),
)
const base = readCatalogueComposition(directory)?.editions.find((entry) => entry.base)
if (!base) throw new Error(`${directory} has no base rules version`)
const baseEdition = base.edition.id
const definitionsByEdition = new Map<string, VsDataDefinitions | null>()
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

type Counts = Record<string, number>
const totals: Record<string, Counts> = {}
const differences: object[] = []
type Listed = Pick<SavedList, 'id' | 'catalogueId' | 'detachmentIds' | 'disposition' | 'limit' | 'picks' | 'waivedRules'> & { kind: string }
/** Every translated unit of one list or loadout, priced and checked both ways and counted. */
function compare(saved: Listed, loadout: boolean) {
  const loaded = editions.catalogueFor(saved.catalogueId)
  const edition = loaded?.edition?.id ?? baseEdition
  const counts = (totals[`${saved.kind} ${edition}`] ??= {})
  const count = (key: string, n = 1) => (counts[key] = (counts[key] ?? 0) + n)
  count('lists')
  const definitions = loaded && definitionsOf(edition)
  const input = { ...savedRosterPriceInput(saved), includeUnitLimits: false }
  const price = definitions && calculateRosterPrice(input, loaded, editions.rulesFor(saved.catalogueId))
  if (!loaded || !definitions || !price) {
    count('lists not read')
    return
  }
  const read = loadout
    ? (() => {
        const [pick, ...joined] = saved.picks
        const kept = withVsLoadout({ catalogueId: saved.catalogueId, pick: pick!, joined }, edition, translationOf)
        return { picks: [kept.pick, ...(kept.joined ?? [])] }
      })()
    : withVsPicks(saved, edition, translationOf)
  const retained = saved.catalogueId.includes('~')
  const key = (keys: Record<string, string>, id: string) => (retained ? keys[`${edition}~${id}`] : undefined) ?? keys[id]
  const faction = key(ids.books, saved.catalogueId.slice(saved.catalogueId.indexOf('~') + 1))
  const detachments = saved.detachmentIds.flatMap((id) => key(ids.detachments, id) ?? [])
  const roster = loadout
    ? []
    : [
        ...[battleSizeSelection(loaded.index, input.limit)].flatMap((selection) => (selection ? [selection] : [])),
        ...rosterDetachments(loaded, input.catalogueId, input.detachmentIds).selections,
      ]
  // Every unit VS Data defines, translated ones whole and the rest by size, so copies count as they will.
  const units = price.units.flatMap((priced) => {
    const pick = read.picks[priced.key]!
    const unit = key(ids.units, pick.entryId)
    if (!unit || !definitions.get('unit', unit)) return []
    const vs = pick.vs
    const vsUnit: VsRosterUnit = vs
      ? {
          unit,
          models: vs.models,
          options: vs.options,
          ...(vs.enhancement ? { enhancement: vs.enhancement } : {}),
          ...(vs.allegiance ? { allegiance: vs.allegiance } : {}),
          ...(vs.warlord ? { warlord: vs.warlord } : {}),
        }
      : { unit, size: priced.size.models }
    return [{ priced, pick, vsUnit }]
  })
  const vsPrice = priceVsRoster(definitions, { faction: faction ?? '', detachments, units: units.map(({ vsUnit }) => vsUnit) })
  const translated = units.flatMap((entry, at) => (entry.pick.vs ? [{ ...entry, points: vsPrice.units[at]!.points }] : []))
  if (translated.length) count('lists with translated units')
  let bsData = 0
  let vsData = 0
  for (const { priced, pick, vsUnit, points } of translated) {
    count('units translated')
    const built = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
      primaryCatalogueId: input.catalogueId,
      mustering: true,
      roster,
      spreads: pick.spreads,
      toggles: pick.toggles,
      floor: pick.floor,
    })
    const specials = specialOf(priced, detachments, ids, key).names
    // The marks a unit holds are its allegiance, never wargear.
    const marks = new Set(
      (definitions.get('unit', vsUnit.unit)!.data.allegiances ?? []).flatMap((offer) =>
        offer.choices.map((id) => same(definitions.get('allegiance', id)?.name ?? id)),
      ),
    )
    const vsBag = vsWargear(definitions, vsUnit)
    const known = vsKnownWargear(definitions, vsUnit.unit)
    const bsBag = new Map<string, number>()
    for (const { name, count: n } of built ? wargearOf(built.selection, loaded.index) : [])
      if (!specials.has(wargearKey(name)) && !marks.has(same(name))) {
        const item = vsSpelling(name, known)
        bsBag.set(item, (bsBag.get(item) ?? 0) + n)
      }
    for (const [item, n] of [...bsBag]) if (!n) bsBag.delete(item)
    const problems: string[] = []
    checkVsUnit(definitions, vsUnit, (code) => problems.push(code))
    const refused = built ? catalogueUnitErrors(loaded.index, roster, input.catalogueId, built.selection) : ['does not build']
    const models = Object.values(pick.vs!.models).reduce((sum, n) => sum + n, 0)
    const checks = {
      points: points === priced.points,
      models: models === priced.size.models,
      wargear: vsBag.size === bsBag.size && [...vsBag].every(([item, n]) => bsBag.get(item) === n),
      verdict: !problems.length === !refused.length,
    }
    bsData += priced.points
    vsData += points
    for (const [check, agrees] of Object.entries(checks)) count(`units ${check} ${agrees ? 'same' : 'differ'}`)
    if (Object.values(checks).some((agrees) => !agrees))
      differences.push({
        kind: saved.kind,
        list: saved.id,
        edition,
        pick: priced.key,
        name: priced.name,
        ...checks,
        prices: [priced.points, points],
        problems,
        refused,
        unpriced: vsPrice.units[units.findIndex((entry) => entry.pick === pick)]?.unpriced,
      })
  }
  // Copy-tiered prices can fall on another copy of the datasheet, so a list compares its translated units' sum.
  if (translated.length) count(`lists points ${bsData === vsData ? 'same' : 'differ'}`)
}

for (const saved of await savedLists(listFile)) compare(saved, false)
// A loadout is priced as the translator froze it: at Strike Force, with no Detachment.
for (const { id, catalogueId, picks } of await savedLoadouts(listFile))
  compare({ kind: 'loadout', id, catalogueId, detachmentIds: [], disposition: null, limit: 2000, picks, waivedRules: [] }, true)

fs.mkdirSync('data-dev', { recursive: true })
fs.writeFileSync('data-dev/saved-pick-parity.ndjson', differences.map((row) => JSON.stringify(row)).join('\n'), { mode: 0o600 })
console.log(Object.fromEntries(Object.entries(totals).toSorted(([a], [b]) => (a < b ? -1 : 1))))
