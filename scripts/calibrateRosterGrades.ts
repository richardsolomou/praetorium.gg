/**
 * Rebuilds `src/core/rosterGradeCalibration.ts`, the percentiles roster grades place a list among, from the
 * tournament lists `scripts/importCorpus.ts` fetches, and says when the committed table is too old.
 *
 *   pnpm exec tsx scripts/importCorpus.ts fetch 40kstats
 *   pnpm exec tsx scripts/calibrateRosterGrades.ts build --since 2026-06-20 --until 2026-11-08 [--source 40kstats] [--live] [directory]
 *   pnpm exec tsx scripts/calibrateRosterGrades.ts check [--max-age 90]
 *
 * Only 2,000-point lists from events in the window that import cleanly count. Each is measured as the server
 * measures a saved roster, and the other battle sizes are drawn from its measured units with a seed from its
 * list id, so the same corpus, window and catalogue rebuild the same table. `--live` measures against the
 * catalogue a release would serve, as `importCorpus.ts` does.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import type { PriceInput } from '../src/contracts/schemas'
import { resolveCombatRequest, type CombatRequest } from '../src/core/combatMatchup'
import { CALIBRATED } from '../src/core/rosterGradeCalibration'
import { calibrate, calibrationLists, CALIBRATED_SIZES, MIN_PEERS } from '../src/core/rosterGradeCalibrator'
import { referenceCatalogue } from '../src/server/canonicalCatalogue'
import { catalogueEditionLoaders } from '../src/server/catalogueEditions'
import { namedCombatant, type CombatCatalogues } from '../src/server/combatTools'
import { serverWords } from '../src/server/publishedTextFiles'
import { referenceCorpusFor } from '../src/server/referenceCorpus'
import { CombatAnswerCache } from '../src/shared/combatAnswerCache'
import { currentFactionIdsOf } from '../src/shared/factionReferences'
import { gradeReferences, measureRosterUnits, referenceUnit } from '../src/shared/rosterGradeMeasures'
import { importCorpusLists, liveCorpusCatalogue } from './lib/importCorpusLists'
import { CORPUS_ROOT } from './lib/importCorpusSources'
import { CALIBRATION_FILE, calibrationSource } from './lib/rosterGradeCalibrationSource'

const DAY = 24 * 60 * 60 * 1000

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    since: { type: 'string' },
    until: { type: 'string' },
    source: { type: 'string' },
    live: { type: 'boolean' },
    'max-age': { type: 'string' },
  },
})
const [command, target] = positionals

if (command === 'build') {
  const { since, until } = values
  if (!since || !until || !/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until))
    throw new Error('Pass the window of event dates as --since YYYY-MM-DD --until YYYY-MM-DD')
  await build(target ?? path.join(CORPUS_ROOT, values.source ?? '40kstats'), since, until)
} else if (command === 'check') {
  const maxAge = Number(values['max-age'] ?? 90)
  const age = Math.floor((Date.now() - Date.parse(CALIBRATED.until)) / DAY)
  if (age > maxAge) {
    console.error(
      `Roster grades are calibrated against events up to ${CALIBRATED.until}, ${age} days ago. Fetch the corpus and run build with a newer window.`,
    )
    process.exitCode = 1
  } else console.log(`Roster grades are calibrated against events up to ${CALIBRATED.until}, ${age} days ago.`)
} else throw new Error('Usage: calibrateRosterGrades.ts build --since YYYY-MM-DD --until YYYY-MM-DD [directory] | check')

async function build(corpusDirectory: string, since: string, until: string) {
  const pinned = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
  const directory = values.live ? await liveCorpusCatalogue(pinned) : pinned
  const { catalogue, rules, lists } = importCorpusLists(corpusDirectory, { since, until }, directory)
  // The server's rule words and reference units read the snapshot this script loaded, not a running server's.
  delete process.env.CATALOGUE_LIVE_DIR
  process.env.CATALOGUE_DIR = directory
  process.env.CATALOGUE_SNAPSHOT_ID ??= catalogue.index.revision
  const editions = catalogueEditionLoaders(
    directory,
    () => catalogue,
    () => rules,
  )
  const catalogues: CombatCatalogues = {
    catalogueFor: async (id) => editions.catalogueFor(id),
    rulesFor: async (id) => editions.rulesFor(id),
    combatUnitsFor: async () => editions.combatUnits(),
    currentFactionIds: async () => currentFactionIdsOf(editions.factions()?.factions ?? []),
  }
  const canonical = editions.canonicalCatalogue(
    referenceCatalogue(
      directory,
      () => catalogue,
      () => rules,
    ),
  )
  const corpus = referenceCorpusFor({
    canonicalCatalogue: () => canonical,
    catalogue: () => catalogue,
    rules: () => rules,
    factions: editions.factions()?.factions,
  })
  if (!corpus) throw new Error(`No reference corpus could be built from ${directory}`)
  const references = await gradeReferences(2000, (_, unit) =>
    referenceUnit(unit, (faction, name, models) => namedCombatant(faction, name, models, { corpus, catalogues })),
  )
  const words = await serverWords()
  // Tournament lists share most of their units, so most matchups repeat.
  const cache = new CombatAnswerCache(512 * 1024 * 1024, 200_000)
  const calculate = async (requests: CombatRequest[]) =>
    requests.map((request) => {
      const held = cache.read(request)
      if (held) return held
      const answer = resolveCombatRequest(request)
      cache.write(request, answer)
      return answer
    })

  const clean = lists
    .filter(({ imported }) => imported.catalogueId && imported.units.length && !imported.unknown.length && !imported.unplaced.length)
    .toSorted((left, right) => left.listing.list.localeCompare(right.listing.list))
  const measured = []
  let failed = 0
  for (const [index, { listing, imported }] of clean.entries()) {
    const data: PriceInput = {
      catalogueId: imported.catalogueId!,
      detachmentIds: imported.detachmentIds,
      disposition: 'disposition' in imported ? (imported.disposition ?? null) : null,
      limit: 2000,
      units: imported.units,
    }
    const loaded = await catalogues.catalogueFor(data.catalogueId)
    const book = loaded?.index.catalogues.get(data.catalogueId)
    try {
      if (!loaded || !book) throw new Error('its catalogue is unavailable')
      const units = await measureRosterUnits({
        loaded,
        rules: await catalogues.rulesFor(data.catalogueId),
        data,
        words,
        references,
        calculate,
      })
      measured.push({ id: listing.list, catalogueName: book.name, units })
    } catch (error) {
      failed++
      console.error(`${listing.list}: not measured, ${error instanceof Error ? error.message : String(error)}`)
    }
    if ((index + 1) % 100 === 0) console.log(`${index + 1} of ${clean.length} lists measured`)
  }
  if (!measured.length) throw new Error('No tournament list in the window could be measured')

  const { expected, peers } = calibrate(calibrationLists(measured))
  fs.writeFileSync(CALIBRATION_FILE, calibrationSource({ since, until, drawn: new Date().toISOString().slice(0, 10) }, expected, peers))
  console.log(
    `${lists.length} lists in the window, ${clean.length} imported cleanly, ${measured.length} measured, ${failed} failed. Wrote ${path.relative(process.cwd(), CALIBRATION_FILE)}`,
  )
  for (const size of CALIBRATED_SIZES)
    console.log(`${size}: ${Object.keys(peers[size]).length - 1} peer groups of ${MIN_PEERS} or more lists`)
}
