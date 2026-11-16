import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { listUnitCount } from '../core/attachedUnits'
import { currentCatalogueFamilyId } from '../core/retiredCatalogueIds'
import { rosterUseProblem } from '../core/rosterLegality'
import { calculateRosterPrice } from '../shared/pricing'
import type { LoadedCatalogue } from './catalogueIndex'
import { fetchWithRetry } from './fetch'
import { replaceFile } from './replaceFile'
import { importedRosterDraft, importRosterInput } from './rosterImport'

const SOURCE = 'https://40kstats.tabletopbattles.com'
const HEADERS = { 'user-agent': 'praetorium.gg (+https://praetorium.gg)' }
/**
 * An import holds the event loop (half a second on the production server), so the pause after each is this many times
 * as long as it took, waits included, leaving requests the rest of the time while a new catalogue revision checks every list again.
 */
const PAUSE_PER_IMPORT = 4
/** A first fill downloads a few hundred lists, so they are spaced out rather than requested back to back. */
const FETCH_PAUSE_MS = 250

const LIST_ID = /^[0-9a-f]{32}$/
export const WINNING_LIST_GONE = 'That list is no longer available.'
const events = z.array(
  z.object({
    eventId: z.string(),
    name: z.string(),
    url: z
      .url({ protocol: /^https?$/ })
      .nullish()
      .catch(null),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rounds: z.number().int().nullish(),
    player_count: z.number().int().nullish(),
    players: z.array(z.object({ ranking: z.number().int(), record: z.string(), list: z.string().regex(LIST_ID) })),
  }),
)
type Events = z.infer<typeof events>

/** What importing one list found under one catalogue revision; null for a list with anything to fix or not legal. */
const verdictSchema = z
  .object({
    name: z.string(),
    catalogueId: z.string(),
    detachmentIds: z.array(z.string()),
    disposition: z.string().nullable(),
    limit: z.number().int(),
    unitCount: z.number().int(),
    /** Each datasheet once with every copy's model count, so a search can find lists by what they field and a tally can count them. */
    datasheets: z.array(z.object({ id: z.string(), name: z.string(), models: z.array(z.number().int()) })),
    points: z.number(),
    reportedPoints: z.number().nullable(),
  })
  .nullable()
type Verdict = z.infer<typeof verdictSchema>
const verdicts = z.object({ revision: z.string(), lists: z.record(z.string(), verdictSchema) })

export type WinningList = NonNullable<Verdict> & {
  id: string
  placing: number
  record: string
  event: { name: string; url: string | null; date: string; rounds: number | null; players: number | null }
}

/** Deploys start the new server before stopping the old one on the same volume, so a file is never left half-written. */
const writeWhole = (file: string, text: string) => replaceFile(file, (temporary) => fs.writeFile(temporary, text))

const listFile = (directory: string, id: string) => path.join(directory, 'lists', `${id}.txt`)
const eventsFile = (directory: string) => path.join(directory, 'events.json')
const verdictsFile = (directory: string) => path.join(directory, 'verdicts.json')

/**
 * Brings the cache up to date with 40k Stats' published top-four placings: the event index each time,
 * and only the lists the cache does not hold, one at a time.
 */
export async function refreshWinningLists(directory: string) {
  const response = await fetchWithRetry(`${SOURCE}/data/reports/topfour.json`, { headers: HEADERS })
  if (!response.ok) throw new Error(`40k Stats placings answered ${response.status}`)
  const placings = events.parse(await response.json())
  await fs.mkdir(path.join(directory, 'lists'), { recursive: true })
  for (const { list } of placings.flatMap((event) => event.players)) {
    if (await fs.stat(listFile(directory, list)).catch(() => null)) continue
    const text = await fetchWithRetry(`${SOURCE}/data/lists/${list}.json`, { headers: HEADERS })
    if (text.ok) {
      const body = await text.text()
      await writeWhole(listFile(directory, list), body)
    }
    await sleep(FETCH_PAUSE_MS)
  }
  await writeWhole(eventsFile(directory), JSON.stringify(placings))
}

/** A list's import, kept only when it has nothing to review and is legal: its verdict and the units it was read as. */
async function importWinningList(text: string) {
  const imported = await importRosterInput(text).catch(() => null)
  if (!imported) return null
  const { result } = imported
  if (!result.catalogueId || !result.units.length || result.unknown.length || result.unplaced.length) return null
  const limit = 'limit' in result ? result.limit : null
  if (!limit) return null
  const disposition = 'disposition' in result ? (result.disposition ?? null) : null
  const roster = { catalogueId: result.catalogueId, detachmentIds: result.detachmentIds, disposition, limit, units: result.units }
  const priced = calculateRosterPrice(roster, imported.loaded, imported.rules)
  if (!priced || rosterUseProblem(priced, { limit })) return null
  const verdict: NonNullable<Verdict> = {
    // The importers' stand-in for an unnamed list; left empty, a card names it by faction and detachments instead.
    name: result.name === 'Imported list' ? '' : result.name,
    catalogueId: result.catalogueId,
    detachmentIds: [...result.detachmentIds],
    disposition,
    limit,
    unitCount: listUnitCount(result.units.map((unit) => ({ attachedTo: 'attachedTo' in unit ? unit.attachedTo : undefined }))),
    points: priced.points,
    datasheets: fielded(priced.units),
    reportedPoints: result.reportedPoints,
  }
  return { verdict, units: result.units, result }
}

function fielded(units: readonly { entryId: string; name: string; size: { models: number } }[]) {
  const datasheets = new Map<string, { id: string; name: string; models: number[] }>()
  for (const unit of units) {
    const datasheet = datasheets.get(unit.entryId) ?? { id: unit.entryId, name: unit.name, models: [] }
    datasheet.models.push(unit.size.models)
    datasheets.set(unit.entryId, datasheet)
  }
  return [...datasheets.values()]
}

const importVerdict = async (text: string): Promise<Verdict> => (await importWinningList(text))?.verdict ?? null

const placed = (
  verdict: NonNullable<Verdict>,
  id: string,
  event: Events[number],
  player: Events[number]['players'][number],
): WinningList => ({
  ...verdict,
  id,
  placing: player.ranking,
  record: player.record,
  event: {
    name: event.name,
    url: event.url ?? null,
    date: event.date,
    rounds: event.rounds ?? null,
    players: event.player_count ?? null,
  },
})

const readJson = async <T>(file: string, schema: z.ZodType<T>) => {
  const text = await fs.readFile(file, 'utf8').catch(() => null)
  try {
    return text === null ? null : schema.safeParse(JSON.parse(text)).data
  } catch {
    return null
  }
}

/**
 * Every cached placing whose list imports with nothing to review and is legal under this catalogue revision, which
 * is what keeps a list built for rules since changed out, whatever its age. Verdicts are kept on disk per revision,
 * so a restart repeats no import and a day adds only new lists. `progress` gets those found so far as it goes, newest
 * events first, since the cache lists events that way.
 */
async function importableLists(
  directory: string,
  revision: string,
  progress: (found: WinningList[]) => void = () => undefined,
): Promise<WinningList[] | null> {
  const cached = await readJson(eventsFile(directory), events)
  if (!cached) return null
  const kept = await readJson(verdictsFile(directory), verdicts)
  // A cache written in an older shape fails the schema and is read as empty, so every list is imported again.
  const known: Record<string, Verdict> = kept?.revision === revision ? kept.lists : {}
  const save = () => writeWhole(verdictsFile(directory), JSON.stringify({ revision, lists: known }))
  const found: WinningList[] = []
  const sorted = () => found.toSorted((left, right) => right.event.date.localeCompare(left.event.date) || left.placing - right.placing)
  let imported = 0
  for (const event of cached)
    for (const player of event.players) {
      if (!(player.list in known)) {
        const text = await fs.readFile(listFile(directory, player.list), 'utf8').catch(() => null)
        if (text === null) continue
        const started = performance.now()
        known[player.list] = await importVerdict(text)
        const took = performance.now() - started
        // Saved as it goes, so a restart part way through carries on rather than starting again.
        if (++imported % 25 === 0) {
          await save()
          progress(sorted())
        }
        await sleep(PAUSE_PER_IMPORT * took)
      }
      const list = known[player.list]
      if (!list) continue
      found.push(placed(list, player.list, event, player))
    }
  await save()
  return sorted()
}

/**
 * How many of a faction's lists field each datasheet, counting a list once however many copies it takes. A faction
 * is its family, so a list imported under one rules version counts towards a roster built under another.
 */
const factionLists = (lists: readonly WinningList[], catalogueId: string) => {
  const family = currentCatalogueFamilyId(catalogueId)
  return lists.filter((list) => currentCatalogueFamilyId(list.catalogueId) === family)
}

export function unitCounts(lists: readonly WinningList[], catalogueId: string) {
  const faction = factionLists(lists, catalogueId)
  const units: Record<string, number> = {}
  for (const list of faction) for (const { id } of list.datasheets) units[id] = (units[id] ?? 0) + 1
  return { lists: faction.length, units }
}

/** A faction's lists, counted by family as unitCounts counts them, narrowed to one detachment and one battle size when given. */
export function matchingLists(
  lists: readonly WinningList[],
  catalogueId: string,
  { detachmentId, battleSize }: { detachmentId?: string; battleSize?: number } = {},
) {
  return factionLists(lists, catalogueId).filter(
    (list) => (!detachmentId || list.detachmentIds.includes(detachmentId)) && (!battleSize || list.limit === battleSize),
  )
}

/** Every datasheet the lists field with how many lists field it, most first, and the unit sizes taken, most common first. */
export function fieldedDatasheets(lists: readonly WinningList[]) {
  const tally = new Map<string, { entryId: string; name: string; lists: number; sizes: Map<number, number> }>()
  for (const list of lists)
    for (const { id, name, models } of list.datasheets) {
      const datasheet = tally.get(id) ?? { entryId: id, name, lists: 0, sizes: new Map<number, number>() }
      datasheet.lists++
      for (const size of models) datasheet.sizes.set(size, (datasheet.sizes.get(size) ?? 0) + 1)
      tally.set(id, datasheet)
    }
  return [...tally.values()]
    .map(({ sizes, ...datasheet }) => ({
      ...datasheet,
      models: [...sizes].toSorted(([leftSize, left], [rightSize, right]) => right - left || leftSize - rightSize).map(([size]) => size),
    }))
    .toSorted((left, right) => right.lists - left.lists || left.name.localeCompare(right.name))
}

/** The faction's lists that field one datasheet, newest first, each with its copies' model counts, out of how many. */
export function unitLists(lists: readonly WinningList[], catalogueId: string, entryId: string) {
  const faction = factionLists(lists, catalogueId)
  return {
    of: faction.length,
    lists: faction.flatMap(({ datasheets, ...list }) => {
      const datasheet = datasheets.find((candidate) => candidate.id === entryId)
      return datasheet
        ? [{ id: list.id, name: list.name, placing: list.placing, record: list.record, event: list.event, models: datasheet.models }]
        : []
    }),
  }
}

/**
 * The importable lists, read again in the background whenever the cache or the catalogue changes. A reader gets the
 * last finished answer straight away, or null before the first one, rather than waiting on any import.
 */
export function winningListsStore(directory: string, catalogue: () => LoadedCatalogue | null, onError: (error: unknown) => void) {
  let shown: { lists: WinningList[]; revision: string; version: number; complete: boolean } | null = null
  let version = 0
  let running: Promise<void> | null = null
  const read = () => {
    const revision = catalogue()?.index.revision
    if (!revision || running || (shown?.complete && shown.revision === revision && shown.version === version)) return
    const reading = version
    // Lists found so far stand in only for none or for an earlier partial read, never for a finished one.
    const partial = (lists: WinningList[]) => {
      if (!shown?.complete) shown = { lists, revision, version: reading, complete: false }
    }
    running = importableLists(directory, revision, partial)
      .then((lists) => {
        if (lists) shown = { lists, revision, version: reading, complete: true }
      })
      .catch(onError)
      .finally(() => {
        running = null
      })
  }
  return {
    /** The lists found so far, null before any, and whether the first import is still checking more. */
    lists: () => {
      read()
      return { lists: shown?.lists ?? null, checking: !shown?.complete }
    },
    /** Null until the first import finishes, since a count out of part of the lists would mark the wrong units. */
    unitCounts: (catalogueId: string) => {
      read()
      return shown?.complete ? unitCounts(shown.lists, catalogueId) : null
    },
    unitLists: (catalogueId: string, entryId: string) => {
      read()
      return shown?.complete ? unitLists(shown.lists, catalogueId, entryId) : null
    },
    refresh: async () => {
      await refreshWinningLists(directory)
      version++
      read()
    },
    /** One placing with the units it imports as, the draft save_roster takes and its army text, read afresh; null for a list that is not shown. */
    list: async (id: string) => {
      if (!LIST_ID.test(id)) return null
      const event = (await readJson(eventsFile(directory), events))?.find((candidate) =>
        candidate.players.some((player) => player.list === id),
      )
      const player = event?.players.find((candidate) => candidate.list === id)
      const text = await fs.readFile(listFile(directory, id), 'utf8').catch(() => null)
      const imported = event && player && text ? await importWinningList(text) : null
      const draft = imported && importedRosterDraft(imported.result)
      return imported && draft && event && player && text
        ? { list: placed(imported.verdict, id, event, player), units: imported.units, draft, text }
        : null
    },
  }
}

export type WinningListsStore = ReturnType<typeof winningListsStore>
