/**
 * Records what every corpus list imports to, and compares two records, so a change to how imports read names can show
 * that no list imports to different units, wargear or points.
 *
 *   pnpm exec tsx scripts/importParity.ts record <out.json> [directory ...]
 *   pnpm exec tsx scripts/importParity.ts compare <before.json> <after.json>
 *
 * `record` reads every source's cache (see `importCorpus.ts fetch`) unless given directories, against CATALOGUE_DIR.
 * `compare` lists each list whose import changed, and fails when a list that imported cleanly imports any differently.
 */
import fs from 'node:fs'
import path from 'node:path'
import { calculateRosterPrice } from '../src/shared/pricing'
import { CORPUS_ROOT, SOURCES } from './lib/importCorpusSources'
import { importCorpusLists } from './lib/importCorpusLists'

type UnitRecord = { entryId: string; name: string; models: number; points: number; enhancements: string[]; wargear: string[] }
type ListRecord = {
  list: string
  catalogueId: string | null
  detachmentIds: string[]
  unread: string[]
  units: UnitRecord[]
  points: number | null
}

const [command, ...rest] = process.argv.slice(2)

if (command === 'record') {
  const [out, ...directories] = rest
  if (!out) throw new Error('Name the file to record into')
  const catalogueDirectory = path.resolve(process.env.CATALOGUE_DIR ?? 'catalogue-data')
  const { catalogue, rules, lists } = importCorpusLists(
    directories.length ? directories : SOURCES.map((source) => path.join(CORPUS_ROOT, source)),
    {},
    catalogueDirectory,
  )
  const records: ListRecord[] = lists.map(({ listing, imported }) => {
    const priced =
      imported.catalogueId && catalogue
        ? calculateRosterPrice(
            {
              catalogueId: imported.catalogueId,
              detachmentIds: imported.detachmentIds,
              disposition: null,
              limit: 2000,
              units: [...imported.units],
            },
            catalogue,
            rules,
          )
        : null
    return {
      list: listing.list,
      catalogueId: imported.catalogueId,
      detachmentIds: [...imported.detachmentIds].toSorted(),
      unread: [
        ...imported.unknown.map((unknown) => unknown.name),
        ...imported.unplaced.flatMap((unit) => unit.choices.map((choice) => `${unit.unit}: ${choice.name}`)),
      ].toSorted(),
      units: (priced?.units ?? []).map((unit) => ({
        entryId: unit.entryId,
        name: unit.name,
        models: unit.size.models,
        points: unit.points,
        enhancements: [...unit.enhancements].toSorted(),
        wargear: unit.wargear.map((piece) => `${piece.count}x ${piece.name}`).toSorted(),
      })),
      points: priced?.points ?? null,
    }
  })
  fs.writeFileSync(out, JSON.stringify(records))
  console.log(`${records.length} lists recorded in ${out}`)
} else if (command === 'compare') {
  const [beforeFile, afterFile] = rest
  if (!beforeFile || !afterFile) throw new Error('Name the two records to compare')
  const read = (file: string) => new Map((JSON.parse(fs.readFileSync(file, 'utf8')) as ListRecord[]).map((record) => [record.list, record]))
  const before = read(beforeFile)
  const after = read(afterFile)
  // A list that imported cleanly must import the same; one that did not can only be reviewed, since reading more of it
  // shows lines of the units it now reads that it could not read before.
  const clean = (record: ListRecord) => record.units.length > 0 && !record.unread.length
  const changed: { list: string; wasClean: boolean; lines: string[] }[] = []
  for (const [list, was] of before) {
    const now = after.get(list)
    if (!now) {
      changed.push({ list, wasClean: clean(was), lines: ['missing from the second record'] })
      continue
    }
    const lines: string[] = []
    const differs = (label: string, left: unknown, right: unknown) => {
      if (JSON.stringify(left) !== JSON.stringify(right)) lines.push(`${label}: ${JSON.stringify(left)} -> ${JSON.stringify(right)}`)
    }
    differs('book', was.catalogueId, now.catalogueId)
    differs('detachments', was.detachmentIds, now.detachmentIds)
    differs('points', was.points, now.points)
    differs('unread', was.unread, now.unread)
    const units = Math.max(was.units.length, now.units.length)
    for (let at = 0; at < units; at++) differs(`unit ${at + 1}`, was.units[at], now.units[at])
    if (lines.length) changed.push({ list, wasClean: clean(was), lines })
  }
  for (const entry of changed.toSorted((left, right) => Number(right.wasClean) - Number(left.wasClean))) {
    console.log(`${entry.wasClean ? 'CLEAN LIST CHANGED' : 'changed'} ${entry.list}`)
    for (const line of entry.lines) console.log(`  ${line}`)
  }
  const broken = changed.filter((entry) => entry.wasClean).length
  const cleanCount = (records: Map<string, ListRecord>) => [...records.values()].filter(clean).length
  console.log(
    `${before.size} lists: ${before.size - changed.length} same, ${changed.length - broken} unclean lists changed, ${broken} clean lists changed; clean ${cleanCount(before)} -> ${cleanCount(after)}`,
  )
  if (broken) process.exitCode = 1
} else throw new Error('Use record or compare')
