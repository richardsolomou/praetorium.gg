/**
 * Imports a corpus of army lists and ranks what the importer could not read.
 *
 * Tournament lists that placed are legal, so anything they lose on import is the importer's
 * or the catalogue's fault, or a list the player edited by hand. `fetch` adds the lists each
 * source publishes to its cache outside the repository (see `lib/importCorpusSources.ts`);
 * `run` reads a source's cache, or any directory of `.txt` lists, with its `index.json` naming
 * each list's faction and date.
 *
 *   pnpm exec tsx scripts/importCorpus.ts fetch [40kstats | lexmechanic | listforge | all]
 *   pnpm exec tsx scripts/importCorpus.ts run [directory] [--source 40kstats] [--since 2026-06-20] [--out results.json] [--live]
 *
 * `--live` imports against the catalogue a release would serve: production follows upstream sources past the pinned
 * snapshot, so a list can fail against the pin and import cleanly there. It follows them from the pin into a cache
 * beside the corpus, which takes a few minutes the first time and whenever upstream has moved.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { CORPUS_ROOT, fetchSource, SOURCES } from './lib/importCorpusSources'
import { importCorpusLists, liveCorpusCatalogue } from './lib/importCorpusLists'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { since: { type: 'string' }, out: { type: 'string' }, source: { type: 'string' }, live: { type: 'boolean' } },
})
const [command = 'run', target] = positionals

if (command === 'fetch') {
  const wanted = target ?? 'all'
  for (const source of SOURCES.filter((candidate) => wanted === 'all' || candidate === wanted)) {
    const { added, total, directory } = await fetchSource(source)
    console.log(`${source}: ${added} new, ${total} held, in ${directory}`)
  }
} else if (command === 'run') {
  const since = values.since
  const out = values.out
  const source = values.source ?? '40kstats'
  const pinned = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
  const catalogueDirectory = values.live ? await liveCorpusCatalogue(pinned) : pinned
  run(target ?? path.join(CORPUS_ROOT, source), since, out, catalogueDirectory)
} else throw new Error(`Unknown command ${command}: use fetch or run`)

function run(directory: string, since: string | undefined, out: string | undefined, catalogueDirectory: string) {
  const results = importCorpusLists([directory], { since }, catalogueDirectory).lists.map(({ listing, imported }) => ({
    ...listing,
    format: imported.format,
    catalogue: imported.catalogueName,
    units: imported.units.length,
    unknown: imported.unknown,
    unplaced: imported.unplaced,
    reportedPoints: imported.reportedPoints,
    currentPoints: imported.currentPoints,
  }))
  if (out) fs.writeFileSync(out, JSON.stringify(results, null, 1))

  const issues = new Map<string, Set<string>>()
  const note = (key: string, id: string) => issues.set(key, (issues.get(key) ?? new Set()).add(id))
  for (const result of results) {
    if (!result.units) {
      note(`unread | ${result.unknown[0]?.reason ?? 'no units'}`, result.list)
      continue
    }
    for (const unknown of result.unknown) note(`${result.faction ?? result.catalogue} | ${unknown.name} | ${unknown.reason}`, result.list)
    for (const unit of result.unplaced)
      for (const choice of unit.choices)
        note(
          `${result.faction ?? result.catalogue} | ${unit.unit.replace(/\s*\(entry \d+\)$/, '')} | ${choice.name} | ${choice.reason}`,
          result.list,
        )
  }
  const clean = results.filter((result) => result.units && !result.unknown.length && !result.unplaced.length).length
  console.log(`${results.length} lists, ${clean} clean, ${results.filter((result) => !result.units).length} unread`)
  for (const [key, lists] of [...issues].toSorted((left, right) => right[1].size - left[1].size)) console.log(`${lists.size}\t${key}`)
}
