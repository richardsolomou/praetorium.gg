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
 *   pnpm exec tsx scripts/importCorpus.ts run [directory] [--source 40kstats] [--since 2026-06-20] [--out results.json]
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadCatalogueHistory } from '../src/server/catalogueHistory'
import { removedNamesOf } from '../src/shared/importMismatch'
import { loadCatalogueTranslations } from '../src/server/catalogueTranslations'
import { importRosterFile } from '../src/shared/rosterFiles'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'
import { CORPUS_ROOT, fetchSource, SOURCES, type Listing } from './lib/importCorpusSources'

const [command = 'run', ...rest] = process.argv.slice(2)
const flag = (name: string) => {
  const at = rest.indexOf(`--${name}`)
  return at >= 0 ? rest.splice(at, 2)[1] : undefined
}

if (command === 'fetch') {
  const wanted = rest[0] ?? 'all'
  for (const source of SOURCES.filter((candidate) => wanted === 'all' || candidate === wanted)) {
    const { added, total, directory } = await fetchSource(source)
    console.log(`${source}: ${added} new, ${total} held, in ${directory}`)
  }
} else if (command === 'run') {
  const since = flag('since')
  const out = flag('out')
  const source = flag('source') ?? '40kstats'
  run(rest[0] ?? path.join(CORPUS_ROOT, source), since, out)
} else throw new Error(`Unknown command ${command}: use fetch or run`)

function run(directory: string, since: string | undefined, out: string | undefined) {
  const indexFile = path.join(directory, 'index.json')
  const listed: Listing[] = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
  const byId = new Map(listed.map((listing) => [listing.list, listing]))
  const ids = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.slice(0, -4))
    .filter((id) => !since || (byId.get(id)?.date ?? '') >= since)
  const catalogueDirectory = process.env.CATALOGUE_DIR ?? 'catalogue-data'
  const { catalogue, rules } = loadSnapshot(catalogueDirectory)
  const translations = loadCatalogueTranslations(catalogueDirectory)
  const removed = removedNamesOf(loadCatalogueHistory(catalogueDirectory) ?? [])

  const results = ids.map((id) => {
    const listing = byId.get(id) ?? { list: id }
    const imported = importRosterFile(
      { file: fs.readFileSync(path.join(directory, `${id}.txt`), 'utf8') },
      catalogue,
      undefined,
      rules,
      translations,
      removed,
    )
    return {
      ...listing,
      format: imported.format,
      catalogue: imported.catalogueName,
      units: imported.units.length,
      unknown: imported.unknown,
      unplaced: imported.unplaced,
      reportedPoints: imported.reportedPoints,
      currentPoints: imported.currentPoints,
    }
  })
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
