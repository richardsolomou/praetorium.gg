/**
 * Records what every corpus list imports to, and compares two records, so a change to how imports read names can show
 * that no list imports to different units, wargear or points.
 *
 * Units are recorded as VS Data reads them, so a list reads the same whether a unit came in as a catalogue pick or a VS
 * pick: its VS Data unit through `catalogue/legacy-ids/units.json` (else `bsdata:<entry>`), its Enhancement and
 * allegiance by VS Data ID, and its wargear in VS Data's spellings through the reviewed ones, its allegiance left out. A VS pick's own
 * selections are recorded beside it, and only counted by `compare`.
 *
 *   pnpm exec tsx scripts/importParity.ts record <out.json> [directory ...]
 *   pnpm exec tsx scripts/importParity.ts compare <before.json> <after.json>
 *
 * `record` reads every source's cache (see `importCorpus.ts fetch`) unless given directories, against CATALOGUE_DIR.
 * `compare` lists each list whose import changed, and fails when a list that imported cleanly imports any differently.
 */
import fs from 'node:fs'
import path from 'node:path'
import rawOptions from '../catalogue/legacy-ids/options.json' with { type: 'json' }
import rawUnits from '../catalogue/legacy-ids/units.json' with { type: 'json' }
import { legacyIdsSchema, legacyOptionsSchema } from '../src/core/legacyIds'
import type { RosterPick, VsPick } from '../src/core/roster'
import { wargearKey } from '../src/core/wargearNames'
import { calculateRosterPrice } from '../src/shared/pricing'
import { vsDefinitionsOf, vsUnitIdOf } from '../src/shared/vsDataBuild'
import { same } from '../src/shared/vsDataModelNames'
import { inBook } from '../src/shared/vsDataPoints'
import { ARTICLE, vsSpelling } from '../src/shared/wargearSpellings'
import { CORPUS_ROOT, SOURCES } from './lib/importCorpusSources'
import { importCorpusLists } from './lib/importCorpusLists'

type UnitRecord = {
  unit: string
  models: number
  points: number
  enhancements: string[]
  allegiance: string | null
  wargear: string[]
  /** What a VS pick holds, left out of the comparison. */
  vs?: Pick<VsPick, 'models' | 'options'>
}
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
  const definitions = catalogue && vsDefinitionsOf(catalogue)
  const options = legacyOptionsSchema.parse(rawOptions).units
  const allegiances = legacyIdsSchema.parse(rawUnits).allegiances ?? {}
  const vsKeys = new Set(definitions?.all('wargear').map((wargear) => wargearKey(wargear.name).replace(ARTICLE, '')))
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
    const catalogueId = imported.catalogueId ?? ''
    const vsDetachments = new Set(imported.detachmentIds.flatMap((id) => catalogue?.vsRoster?.detachments[id] ?? []))
    const enhancementId = (option: string) =>
      Object.entries(catalogue?.vsRoster?.enhancements ?? {}).find(
        ([key]) => key.endsWith(`/${option}`) && vsDetachments.has(key.slice(0, key.indexOf('/'))),
      )?.[1]
    const allegianceOf = (pick: RosterPick) => {
      if (pick.vs) return pick.vs.allegiance ?? null
      const entry = inBook(options, catalogueId, pick.entryId)
      const chosen = Object.entries(pick.choices ?? {}).flatMap(([key, option]) => {
        const read = entry?.choices[`${key}|${option}`]
        return read && 'allegiance' in read ? [read.allegiance] : []
      })
      return chosen[0] ?? inBook(allegiances, catalogueId, pick.entryId) ?? null
    }
    const allegianceName = (id: string | null) => (id ? definitions?.get('allegiance', id)?.name : undefined)
    return {
      list: listing.list,
      catalogueId: imported.catalogueId,
      detachmentIds: [...imported.detachmentIds].toSorted(),
      unread: [
        ...imported.unknown.map((unknown) => unknown.name),
        ...imported.unplaced.flatMap((unit) => unit.choices.map((choice) => `${unit.unit}: ${choice.name}`)),
      ].toSorted(),
      units: (priced?.units ?? []).map((unit) => {
        const pick: RosterPick = imported.units[unit.key]!
        const vsUnit = catalogue && vsUnitIdOf(catalogue, catalogueId, unit.entryId)
        const allegiance = allegianceOf(pick)
        const enhancements = pick.vs?.enhancement
          ? [pick.vs.enhancement]
          : unit.choices.flatMap((choice) =>
              choice.kind
                ? choice.options.filter((option) => option.count > 0).map((option) => enhancementId(option.id) ?? option.name)
                : [],
            )
        const named = allegiance && same(allegianceName(allegiance) ?? allegiance)
        const wargear = new Map<string, number>()
        for (const piece of unit.wargear) {
          // An allegiance is no wargear, though a VS pick's roster line names it beside its wargear, as BSData names a mark.
          if (named && same(piece.name).endsWith(named)) continue
          const key = pick.vs ? wargearKey(piece.name).replace(ARTICLE, '') : vsSpelling(piece.name, vsKeys)
          wargear.set(key, (wargear.get(key) ?? 0) + piece.count)
        }
        return {
          unit: vsUnit ?? `bsdata:${unit.entryId}`,
          models: unit.size.models,
          points: unit.points,
          enhancements: enhancements.toSorted(),
          allegiance,
          wargear: [...wargear].map(([key, count]) => `${count}x ${key}`).toSorted(),
          ...(pick.vs ? { vs: { models: pick.vs.models, options: pick.vs.options } } : {}),
        }
      }),
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
  // A unit that comes in as a VS pick, or stops being one, is no change of itself: its record reads the same either way.
  const toVs: string[] = []
  const toCatalogue: string[] = []
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
    for (let at = 0; at < units; at++) {
      const [left, right] = [was.units[at], now.units[at]]
      if (left && right && !left.vs !== !right.vs) (right.vs ? toVs : toCatalogue).push(`${list} unit ${at + 1}`)
      differs(`unit ${at + 1}`, left && { ...left, vs: undefined }, right && { ...right, vs: undefined })
    }
    if (lines.length) changed.push({ list, wasClean: clean(was), lines })
  }
  for (const entry of changed.toSorted((left, right) => Number(right.wasClean) - Number(left.wasClean))) {
    console.log(`${entry.wasClean ? 'CLEAN LIST CHANGED' : 'changed'} ${entry.list}`)
    for (const line of entry.lines) console.log(`  ${line}`)
  }
  for (const unit of toCatalogue) console.log(`no longer a VS pick: ${unit}`)
  const broken = changed.filter((entry) => entry.wasClean).length
  const cleanCount = (records: Map<string, ListRecord>) => [...records.values()].filter(clean).length
  console.log(
    `${before.size} lists: ${before.size - changed.length} same, ${changed.length - broken} unclean lists changed, ${broken} clean lists changed; clean ${cleanCount(before)} -> ${cleanCount(after)}; ${toVs.length} units became VS picks, ${toCatalogue.length} stopped being them`,
  )
  if (broken) process.exitCode = 1
} else throw new Error('Use record or compare')
