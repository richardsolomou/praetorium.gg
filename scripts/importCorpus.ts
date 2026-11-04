/**
 * Imports a corpus of army lists and ranks what the importer could not read.
 *
 * Tournament lists that placed are legal, so anything they lose on import is the importer's
 * or the catalogue's fault, or a list the player edited by hand. `fetch` caches the top-four
 * lists 40kstats.tabletopbattles.com publishes outside the repository; `run` reads any
 * directory of `.txt` lists, with that cache's `index.json` naming each list's faction and date.
 *
 *   pnpm exec tsx scripts/importCorpus.ts fetch
 *   pnpm exec tsx scripts/importCorpus.ts run [directory] [--since 2026-06-20] [--out results.json]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { importRosterFile } from '../src/shared/rosterFiles'
import { loadSnapshot } from './lib/catalogueSnapshotLoad'

type Listing = { list: string; faction?: string; detachment?: string; event?: string; date?: string }

const SOURCE = 'https://40kstats.tabletopbattles.com/data'
const cache = path.join(os.homedir(), '.cache', 'praetorium', 'import-corpus', '40kstats')

const [command = 'run', ...rest] = process.argv.slice(2)
const flag = (name: string) => {
  const at = rest.indexOf(`--${name}`)
  return at >= 0 ? rest.splice(at, 2)[1] : undefined
}

if (command === 'fetch') await fetchCorpus()
else if (command === 'run') {
  const since = flag('since')
  const out = flag('out')
  run(rest[0] ?? cache, since, out)
} else throw new Error(`Unknown command ${command}: use fetch or run`)

async function fetchCorpus() {
  fs.mkdirSync(cache, { recursive: true })
  const factions: Record<string, Record<string, Omit<Listing, 'faction' | 'detachment'>[]>> = await (
    await fetch(`${SOURCE}/reports/factiontopfour.json`)
  ).json()
  const index = Object.entries(factions).flatMap(([faction, detachments]) =>
    Object.entries(detachments).flatMap(([detachment, players]) => players.map((player) => ({ ...player, faction, detachment }))),
  )
  fs.writeFileSync(path.join(cache, 'index.json'), JSON.stringify(index))
  const missing = [...new Set(index.map((listing) => listing.list))].filter((id) => !fs.existsSync(path.join(cache, `${id}.txt`)))
  for (let at = 0; at < missing.length; at += 4)
    await Promise.all(
      missing.slice(at, at + 4).map(async (id) => {
        const response = await fetch(`${SOURCE}/lists/${id}.json`)
        if (response.ok) fs.writeFileSync(path.join(cache, `${id}.txt`), await response.text())
      }),
    )
  console.log(`${index.length} listings, ${missing.length} fetched, cached in ${cache}`)
}

function run(directory: string, since: string | undefined, out: string | undefined) {
  const indexFile = path.join(directory, 'index.json')
  const listed: Listing[] = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
  const byId = new Map(listed.map((listing) => [listing.list, listing]))
  const ids = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.txt'))
    .map((name) => name.slice(0, -4))
    .filter((id) => !since || (byId.get(id)?.date ?? '') >= since)
  const { catalogue, rules } = loadSnapshot(process.env.CATALOGUE_DIR ?? 'catalogue-data')

  const results = ids.map((id) => {
    const listing = byId.get(id) ?? { list: id }
    const imported = importRosterFile({ file: fs.readFileSync(path.join(directory, `${id}.txt`), 'utf8') }, catalogue, undefined, rules)
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
