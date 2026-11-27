import fs from 'node:fs'
import { createGunzip } from 'node:zlib'
import { createInterface } from 'node:readline'
import { type VsDataConstruction, vsDataDefinitions, type VsDataDefinitions } from '../../src/core/vsDataConstruction'
import { checkVsRoster, priceVsRoster, type VsProblemCode } from '../../src/core/vsDataRoster'
import { catalogueEditionLoaders } from '../../src/server/catalogueEditions'
import type { LoadedCatalogue } from '../../src/shared/catalogueIndex'
import type { LoadedRules } from '../../src/shared/rules'
import { calculateRosterPrice, savedRosterPriceInput } from '../../src/shared/pricing'
import { flooredPicks } from '../../src/core/printedDefaults'
import { currentRosterIds, fieldedRosterIds } from '../../src/core/retiredCatalogueIds'
import type { RosterPick } from '../../src/core/roster'
import type { FormatRuleId } from '../../src/core/battle'
import { deployedRosterIds, productionRosterSnapshotSchema } from './productionRosters'
import { legacyIds, vsRosterOf } from './vsDataRosters'

/** A list as Praetorium keeps it: a saved roster, or one fielded into a battle or a sealed event. */
export type SavedList = {
  kind: 'roster' | 'battle' | 'sealed'
  id: string
  catalogueId: string
  detachmentIds: string[]
  disposition: string | null
  limit: number
  pointsBudget?: number | null
  picks: RosterPick[]
  waivedRules: FormatRuleId[]
  borrowedDetachmentId?: string | null
}

type RosterRow = {
  kind: SavedList['kind']
  id: string
  edition: string
  /** Why the roster or a unit of it reads as no VS Data roster, such as a datasheet still on BSData. */
  gaps: string[]
  /** `fieldManual` is the price with every datasheet on the field manual, as before VS Data priced lists. */
  points: { today: number; fieldManual: number; vsData: number } | null
  /** Units whose price differs, as `name: today against VS Data`. */
  units: string[]
  /** Units VS Data prices differently from the field manual, as `name: field manual to today`. */
  repriced?: string[]
  /** Errors the list has under VS Data's prices and not the field manual's, or the reverse. */
  errorsChanged?: string[]
  legal: { today: boolean; vsData: boolean }
  /** What VS Data's checker reports, by code, and in its words. */
  problems: VsProblemCode[]
  messages?: string[]
  /** What today's checks that VS Data's replaces report. */
  errors: string[]
}

/** Every list in a local production copy (`scripts/fetchProductionCopy.ts`), or the saved rosters of a roster snapshot. */
export async function savedLists(file: string): Promise<SavedList[]> {
  if (!file.endsWith('.gz')) {
    const snapshot = productionRosterSnapshotSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')))
    return snapshot.rosters.map((stored) => ({ kind: 'roster', ...deployedRosterIds(stored) }))
  }
  const lists: SavedList[] = []
  const fielded = (kind: 'battle' | 'sealed', id: string, built: Record<string, unknown>, at: number) => {
    const picks = (built.picks as RosterPick[] | undefined) ?? []
    const read = fieldedRosterIds(
      {
        catalogueId: built.catalogueId as string,
        detachmentIds: (built.detachmentIds as string[] | undefined) ?? [],
        // A battle folds a list fielded before choices started on their printed default with the cheapest of each.
        picks: kind === 'battle' && !built.printedDefaults ? flooredPicks(picks) : picks,
      },
      at,
    )
    lists.push({
      kind,
      id,
      ...read,
      disposition: (built.disposition as string | null | undefined) ?? null,
      limit: built.limit as number,
      pointsBudget: (built.pointsBudget as number | undefined) ?? null,
      waivedRules: (built.waivedRules as FormatRuleId[] | undefined) ?? [],
    })
  }
  const lines = createInterface({ input: fs.createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    const entry = JSON.parse(line) as { product?: string; rows?: Record<string, unknown>[] }
    for (const row of entry.rows ?? []) {
      if (entry.product === 'rosters') {
        const detachment = (row.detachmentId as string | null) ?? ''
        const stored = {
          id: row.id as string,
          catalogueId: row.catalogueId as string,
          detachmentIds: !detachment ? [] : detachment.startsWith('[') ? (JSON.parse(detachment) as string[]) : [detachment],
          disposition: (row.disposition as string | null) ?? null,
          limit: row.limit as number,
          picks: JSON.parse(row.picks as string) as RosterPick[],
          waivedRules: JSON.parse((row.waivedRules as string | null) ?? '[]') as FormatRuleId[],
          optionalRules: JSON.parse((row.optionalRules as string | null) ?? '[]') as never[],
          borrowedDetachmentId: null,
          printedDefaults: row.printedDefaults === true,
          baseRosterId: null,
          source: 'praetorium' as const,
          createdAt: Number(row.createdAt),
          updatedAt: Number(row.updatedAt),
        }
        lists.push({ kind: 'roster', ...deployedRosterIds(stored) })
      }
      if (entry.product === 'commands') {
        const body = JSON.parse(row.body as string) as { kind?: string; roster?: { built?: Record<string, unknown> } }
        if (body.kind === 'attach-roster' && body.roster?.built?.catalogueId)
          fielded('battle', `${row.battleId as string}/${row.seq as number}`, body.roster.built, Number(row.at))
      }
      if (entry.product === 'sealedEventEntries' && row.rosterSnapshot) {
        const snapshot = JSON.parse(row.rosterSnapshot as string) as { built?: Record<string, unknown> }
        if (snapshot.built?.catalogueId) fielded('sealed', row.key as string, snapshot.built, Number(row.submittedAt ?? row.joinedAt))
      }
    }
  }
  return lists
}

/** When the backup a local production copy was restored from was taken, from the copy's closing record. */
export async function copiedAtOf(file: string): Promise<string> {
  let copiedAt: string | undefined
  const lines = createInterface({ input: fs.createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const line of lines) if (line.startsWith('{"end"')) copiedAt = (JSON.parse(line) as { end: string }).end
  if (!copiedAt) throw new Error(`${file} does not say when its backup was taken; fetch a new copy`)
  return copiedAt
}

/** A saved unit loadout as a pick list: its own unit first, then the units joined with it. */
export type SavedLoadout = { id: string; catalogueId: string; picks: RosterPick[] }

/** Every saved unit loadout in a local production copy, read against current IDs as a roster saved then would be. */
export async function savedLoadouts(file: string): Promise<SavedLoadout[]> {
  if (!file.endsWith('.gz')) return []
  const loadouts: SavedLoadout[] = []
  const lines = createInterface({ input: fs.createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    const entry = JSON.parse(line) as { product?: string; rows?: Record<string, unknown>[] }
    if (entry.product !== 'unitLoadouts') continue
    for (const row of entry.rows ?? []) {
      const picks = [JSON.parse(row.pick as string) as RosterPick, ...(JSON.parse((row.joined as string | null) ?? '[]') as RosterPick[])]
      const read = currentRosterIds({ catalogueId: row.catalogueId as string, detachmentIds: [], picks, updatedAt: Number(row.createdAt) })
      loadouts.push({ id: row.id as string, catalogueId: read.catalogueId, picks: [...read.picks] })
    }
  }
  return loadouts
}

/**
 * Whether an error is one of the checks Praetorium keeps whatever source builds the list: the format rules a roster
 * may waive (points limit, Detachment points, Warlord, King of the Colosseum), attachments, one Enhancement a unit, and
 * a saved datasheet that is gone. Every other check is the catalogue's, which VS Data's checker replaces.
 */
export const keptCheck = (message: string) =>
  /must be attached|cannot support|cannot be attached|can be attached|needs a Warlord|needs exactly \d+ Warlord|King of the Colosseum|detachments at this battle size may cost|no longer available|can have only one|replaced faction catalogue|detachment that is no longer available/.test(
    message,
  )

const fieldManualCopies = new WeakMap<LoadedCatalogue, LoadedCatalogue>()
/** The catalogue as it priced and checked lists before VS Data did: the field manual's prices and the catalogue's checks. */
const withoutVsPoints = (loaded: LoadedCatalogue) => {
  const { vsPoints: _points, vsRoster: _roster, ...rest } = loaded
  if (!fieldManualCopies.has(loaded)) fieldManualCopies.set(loaded, rest)
  return fieldManualCopies.get(loaded)!
}

/** Every saved list read as a VS Data roster on its own rules version, priced and checked both ways. */
export async function rosterParity(
  directory: string,
  catalogue: LoadedCatalogue,
  rules: LoadedRules | null,
  constructionOf: (edition: string) => VsDataConstruction,
  file: string,
  baseEdition: string,
) {
  const editions = catalogueEditionLoaders(
    directory,
    () => catalogue,
    () => rules,
  )
  const ids = legacyIds()
  const definitionsByEdition = new Map<string, VsDataDefinitions | null>()
  const definitionsFor = (edition: string) => {
    if (!definitionsByEdition.has(edition)) {
      let found: VsDataDefinitions | null = null
      try {
        found = vsDataDefinitions(constructionOf(edition))
      } catch {
        found = null
      }
      definitionsByEdition.set(edition, found)
    }
    return definitionsByEdition.get(edition)!
  }
  const rows: RosterRow[] = []
  for (const saved of await savedLists(file)) {
    const loaded = editions.catalogueFor(saved.catalogueId)
    const input = { ...savedRosterPriceInput(saved), includeUnitLimits: false }
    const price = loaded && calculateRosterPrice(input, loaded, editions.rulesFor(saved.catalogueId))
    const fieldManual = loaded && calculateRosterPrice(input, withoutVsPoints(loaded), editions.rulesFor(saved.catalogueId))
    const edition = loaded?.edition?.id ?? baseEdition
    const definitions = definitionsFor(edition)
    const base = { kind: saved.kind, id: saved.id, edition }
    if (!loaded || !price || !definitions) {
      rows.push({
        ...base,
        gaps: [!loaded || !price ? 'unavailable today' : 'no VS Data release for its rules version'],
        points: null,
        units: [],
        legal: { today: false, vsData: false },
        problems: [],
        errors: [],
      })
      continue
    }
    const retained = saved.catalogueId.includes('~') ? edition : null
    const { roster, keys = [], gaps } = vsRosterOf(input, price, loaded, definitions, ids, retained)
    const errors = [
      ...price.errors.map((error) => `${error.entryName} ${error.message}`),
      ...(price.detachmentError ? [price.detachmentError] : []),
    ]
    // Legal today by the checks VS Data's replaces; the checks Praetorium keeps answer alike either way.
    const today = !errors.some((error) => !keptCheck(error))
    if (!roster) {
      rows.push({
        ...base,
        gaps: gaps.map((gap) => gap.reason),
        points: null,
        units: [],
        legal: { today, vsData: false },
        problems: [],
        errors,
      })
      continue
    }
    const vsPrice = priceVsRoster(definitions, roster)
    const problems = checkVsRoster(definitions, roster, vsPrice)
    const vsUnitOf = new Map(keys.map((key, at) => [key, vsPrice.units[at]!]))
    rows.push({
      ...base,
      gaps: gaps.map((gap) => gap.reason),
      points: { today: price.points, fieldManual: fieldManual?.points ?? price.points, vsData: vsPrice.points },
      units: price.units.flatMap((unit) => {
        const vs = vsUnitOf.get(unit.key)
        return !vs || unit.points === vs.points || gaps.some((gap) => gap.unit === unit.key)
          ? []
          : [`${unit.name}: ${unit.points} against ${vs.points}${vs.unpriced.length ? ` (${vs.unpriced.join(', ')})` : ''}`]
      }),
      errorsChanged: (() => {
        const said = (reported: readonly { entryName: string; message: string }[] = []) =>
          reported.map((error) => `${error.entryName} ${error.message}`)
        const before = said(fieldManual?.errors)
        const after = said(price.errors)
        return [
          ...after.filter((error) => !before.includes(error)).map((error) => `+ ${error}`),
          ...before.filter((error) => !after.includes(error)).map((error) => `- ${error}`),
        ]
      })(),
      repriced: price.units.flatMap((unit) => {
        const before = fieldManual?.units.find((candidate) => candidate.key === unit.key)?.points
        return before === undefined || before === unit.points ? [] : [`${unit.name}: ${before} to ${unit.points}`]
      }),
      legal: { today, vsData: !problems.length },
      problems: [...new Set(problems.map((problem) => problem.code))],
      messages: problems.map((problem) => problem.message),
      errors: errors.filter((error) => !keptCheck(error)),
    })
  }
  const totalsOf = (kind: SavedList['kind']) => {
    const all = rows.filter((row) => row.kind === kind)
    const whole = all.filter((row) => row.points && !row.gaps.length)
    const count = (test: (row: RosterRow) => boolean) => whole.filter(test).length
    const codes = new Map<string, number>()
    for (const row of whole) for (const code of row.problems) codes.set(code, (codes.get(code) ?? 0) + 1)
    return {
      lists: all.length,
      read: all.filter((row) => row.points).length,
      wholeRead: whole.length,
      pointsSame: count((row) => row.points!.today === row.points!.vsData),
      pointsDiffer: count((row) => row.points!.today !== row.points!.vsData),
      repricedByVsData: all.filter((row) => row.points && row.points.today !== row.points.fieldManual).length,
      errorsChangedByVsData: all.filter((row) => row.errorsChanged?.length).length,
      legalBoth: count((row) => row.legal.today && row.legal.vsData),
      illegalBoth: count((row) => !row.legal.today && !row.legal.vsData),
      illegalOnlyVsData: count((row) => row.legal.today && !row.legal.vsData),
      illegalOnlyToday: count((row) => !row.legal.today && row.legal.vsData),
      vsDataCodes: Object.fromEntries([...codes].toSorted((left, right) => right[1] - left[1])),
    }
  }
  const totals = { rosters: totalsOf('roster'), battles: totalsOf('battle'), sealed: totalsOf('sealed') }
  const gapCounts = new Map<string, number>()
  for (const row of rows)
    for (const gap of row.gaps) {
      const kind = gap
        .replace(/^.*?: /, '')
        .replace(/ [\w-]+(\.[\w-]+)+ /, ' <id> ')
        .replace(/datasheet .* has no/, 'datasheet has no')
        .replace(/enhancement .* has no/, 'enhancement has no')
      gapCounts.set(kind, (gapCounts.get(kind) ?? 0) + 1)
    }
  console.log('lists', totals)
  console.log('gaps', Object.fromEntries([...gapCounts].toSorted((left, right) => right[1] - left[1]).slice(0, 15)))
  return { totals, gaps: Object.fromEntries(gapCounts), rows }
}
