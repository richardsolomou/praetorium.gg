import { performance } from 'node:perf_hooks'
import { attachedUnit } from '../src/core/attach'
import { buildUnit, type RosterPick } from '../src/core/roster'
import { app } from '../src/server/app'
import { abilityNamesIn, datasheetIn, datasheetViewsIn } from '../src/server/catalogue'
import { loadCatalogue } from '../src/server/catalogueIndex'
import { describeDatasheetAbilities } from '../src/server/datasheetDescriptions'
import { calculateRosterPrice, rosterDetachments } from '../src/server/pricing'
import { deploymentRules } from '../src/server/pricing'

process.env.CATALOGUE_DIR ??= new URL('../catalogue-data', import.meta.url).pathname
process.env.DATABASE_URL ??= 'postgres://benchmark:benchmark@localhost/benchmark'

const requireCatalogue = () => {
  const catalogue = loadCatalogue(process.env.CATALOGUE_DIR)
  if (!catalogue) throw new Error('catalogue unavailable')
  return catalogue
}
const loaded = requireCatalogue()
const faction = loaded.factions.toSorted((left, right) => right.references[0].datasheets - left.references[0].datasheets)[0]
const ids = [...(loaded.index.datasheets.get(faction.id) ?? [])]
const sizes = [5, 10, 20, 40]

function input(size: number) {
  const picks: RosterPick[] = Array.from({ length: size }, (_, at) => ({ entryId: ids[at % ids.length] }))
  return { catalogueId: faction.id, detachmentIds: [], disposition: null, limit: 2_000, units: picks }
}

function context(picks: readonly RosterPick[], pickIndex: number) {
  const detachments = rosterDetachments(loaded, faction.id, []).selections
  const built = picks.flatMap((pick, index) => {
    const unit = buildUnit(pick.entryId, loaded.index, pick.models, pick.choices, {
      primaryCatalogueId: faction.id,
      roster: detachments,
      spreads: pick.spreads,
      toggles: pick.toggles,
    })
    return unit ? [{ index, selection: unit.selection }] : []
  })
  const selected = built.findIndex((unit) => unit.index === pickIndex)
  const selections = [...detachments, ...built.map((unit) => unit.selection)]
  const attached = attachedUnit(picks, pickIndex)
  const companions = built.flatMap((unit, at) => (attached.includes(unit.index) ? [detachments.length + at] : []))
  return { selections, unitSelectionIndex: detachments.length + selected, companions }
}

function projectWithContext(picks: readonly RosterPick[], prepared: ReturnType<typeof context>) {
  const selectedIndex = Math.floor(picks.length / 2)
  const selectedId = picks[selectedIndex].entryId
  const views = datasheetViewsIn(loaded, faction.id, selectedId, prepared)
  describeDatasheetAbilities(loaded, faction.id, views.selected, app().rules())
  describeDatasheetAbilities(loaded, faction.id, views.available, app().rules())
}

function project(picks: readonly RosterPick[], shared: boolean) {
  const selectedIndex = Math.floor(picks.length / 2)
  const selectedId = picks[selectedIndex].entryId
  const first = context(picks, selectedIndex)
  if (shared) {
    projectWithContext(picks, first)
    return
  }
  describeDatasheetAbilities(loaded, faction.id, datasheetIn(loaded, faction.id, selectedId, first), app().rules())
  const second = context(picks, selectedIndex)
  describeDatasheetAbilities(
    loaded,
    faction.id,
    datasheetIn(loaded, faction.id, selectedId, { ...second, everyWeapon: true }),
    app().rules(),
  )
}

function median(work: () => void, repetitions = 9) {
  work()
  const samples = Array.from({ length: repetitions }, () => {
    const start = performance.now()
    work()
    return performance.now() - start
  }).toSorted((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

console.log(`faction=${faction.name} datasheets=${ids.length}`)
if (process.env.VERIFY_DEPLOYMENT_ABILITIES) {
  for (const candidateFaction of loaded.factions) {
    for (const entryId of loaded.index.datasheets.get(candidateFaction.id) ?? []) {
      const sheet = datasheetIn(loaded, candidateFaction.id, entryId)
      const projectedNames = sheet?.abilities.map((ability) => ability.name) ?? []
      const projected = deploymentRules(projectedNames)
      const directNames = abilityNamesIn(loaded, candidateFaction.id, entryId)
      const direct = deploymentRules(directNames)
      if (JSON.stringify(projected) !== JSON.stringify(direct)) {
        throw new Error(
          `deployment abilities differ for ${sheet?.name ?? entryId}: ${JSON.stringify({ projected, direct, projectedNames, directNames })}`,
        )
      }
    }
  }
}
if (process.env.PROFILE) {
  for (let repetition = 0; repetition < 10; repetition += 1) calculateRosterPrice(input(40))
  process.exit(0)
}
console.log('units\tprice_ms\tduplicate_datasheets_ms\tshared_datasheets_ms\treused_context_ms\treuse_speedup\tcontext_kib')
for (const size of sizes) {
  const data = input(size)
  const price = median(() => void calculateRosterPrice(data), 3)
  const oldSheets = median(() => project(data.units, false))
  const newSheets = median(() => project(data.units, true))
  const prepared = context(data.units, Math.floor(data.units.length / 2))
  const reused = median(() => projectWithContext(data.units, prepared))
  const contextKib = Buffer.byteLength(JSON.stringify(prepared)) / 1024
  console.log(
    `${size}\t${price.toFixed(1)}\t${oldSheets.toFixed(1)}\t${newSheets.toFixed(1)}\t${reused.toFixed(1)}\t${(newSheets / reused).toFixed(2)}x\t${contextKib.toFixed(1)}`,
  )
}
