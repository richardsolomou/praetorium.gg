import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { listUnitCount } from '../core/attachedUnits'
import { currentCatalogueFamilyId } from '../core/retiredCatalogueIds'
import { rosterUseProblem } from '../core/rosterLegality'
import { saveRosterSchema } from '../contracts/schemas'
import { version as release } from '../../package.json'
import { calculateRosterPrice } from '../shared/pricing'
import type { LoadedCatalogue } from '../shared/catalogueIndex'
import { fetchWithRetry } from './fetch'
import { replaceFile } from './replaceFile'
import { miniHeadquartersEvents } from './miniHeadquartersLists'
import { importedRosterDraft, importRosterInput } from './rosterImport'
import type { RosterPick } from '../core/roster'
import { vsWarlordOf } from '../shared/importedVsPicks'
import { assumeWarlord } from '../shared/rosterFiles'

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
    /** The site that published the placing; 40k Stats' own index does not say, so it is the default. */
    source: z.enum(['40kstats', 'miniheadquarters']).catch('40kstats'),
  }),
)
type Events = z.infer<typeof events>

/** What importing one list found under one catalogue revision; null for a list with anything to fix. */
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
    /** Why today's points and rules would not field it, usually a points rise since the event; null for a list legal today. */
    problem: z.enum(['over-limit', 'not-legal']).nullable(),
  })
  .nullable()
type Verdict = z.infer<typeof verdictSchema>
const verdicts = z.object({ revision: z.string(), lists: z.record(z.string(), verdictSchema) })
/**
 * One list's import under one revision and app release, with the draft its page and get_winning_list read, so no reader
 * imports it again until either changes: a release can change how lists import while the catalogue stays the same.
 */
const importedSchema = z.object({ revision: z.string(), release: z.string(), verdict: verdictSchema, draft: saveRosterSchema.nullable() })
type Imported = z.infer<typeof importedSchema>

export type WinningList = NonNullable<Verdict> & {
  id: string
  placing: number
  record: string
  event: { name: string; url: string | null; date: string; rounds: number | null; players: number | null; source: WinningListSource }
}
export type WinningListSource = Events[number]['source']

/** Deploys start the new server before stopping the old one on the same volume, so a file is never left half-written. */
const writeWhole = (file: string, text: string) => replaceFile(file, (temporary) => fs.writeFile(temporary, text))

const listFile = (directory: string, id: string) => path.join(directory, 'lists', `${id}.txt`)
const eventsFile = (directory: string) => path.join(directory, 'events.json')
const verdictsFile = (directory: string) => path.join(directory, 'verdicts.json')
const checkingFile = (directory: string) => path.join(directory, 'verdicts-checking.json')
const importedFile = (directory: string, id: string) => path.join(directory, 'imported', `${id}.json`)

/**
 * Brings the cache up to date with the top-four placings 40k Stats and Mini Headquarters publish: 40k Stats' event
 * index each time, Mini Headquarters' events the cache does not hold, and only the lists the cache does not hold, one
 * at a time. A Mini Headquarters failure still keeps 40k Stats' placings and the events it already cached.
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
  const french = await miniHeadquartersEvents(directory, (id, text) => writeWhole(listFile(directory, id), text))
  const all = [...placings, ...events.parse(french.events)].toSorted((left, right) => right.date.localeCompare(left.date))
  await writeWhole(eventsFile(directory), JSON.stringify(all))
  if (french.failure) throw french.failure
}

/** A list's import, kept only when it has nothing to review: its verdict, whether it is legal today, and the draft it was read as. */
async function importWinningList(text: string) {
  const imported = await importRosterInput(text).catch(() => null)
  if (!imported) return null
  const { result } = imported
  if (!result.catalogueId || !result.units.length || result.unknown.length || result.unplaced.length) return null
  const limit = 'limit' in result ? result.limit : null
  if (!limit) return null
  const disposition = 'disposition' in result ? (result.disposition ?? null) : null
  const roster = { catalogueId: result.catalogueId, detachmentIds: result.detachmentIds, disposition, limit, units: result.units }
  const price = () => calculateRosterPrice(roster, imported.loaded, imported.rules)
  assumeWarlord<RosterPick>(
    result.units,
    () => price()?.errors.length ?? Number.POSITIVE_INFINITY,
    (pick) => (imported.loaded ? vsWarlordOf(imported.loaded, roster.catalogueId, pick.entryId) : undefined),
  )
  const priced = price()
  if (!priced) return null
  const verdict: NonNullable<Verdict> = {
    // The importers' stand-in for an unnamed list; left empty, a card names it by faction and detachments instead.
    name: result.name === 'Imported list' ? '' : result.name,
    catalogueId: result.catalogueId,
    detachmentIds: [...result.detachmentIds],
    disposition,
    limit,
    unitCount: listUnitCount(result.units.map((unit) => ({ attachedTo: 'attachedTo' in unit ? unit.attachedTo : undefined }))),
    datasheets: fielded(priced.units),
    points: priced.points,
    reportedPoints: result.reportedPoints,
    problem: rosterUseProblem(priced, { limit })?.kind ?? null,
  }
  return { verdict, draft: importedRosterDraft(result) }
}

/** Imports a list and keeps the result under the revision. */
async function importAndKeep(directory: string, id: string, text: string, revision: string): Promise<Imported> {
  const imported = await importWinningList(text)
  const kept = { revision, release, verdict: imported?.verdict ?? null, draft: imported?.draft ?? null }
  await fs.mkdir(path.dirname(importedFile(directory, id)), { recursive: true })
  await writeWhole(importedFile(directory, id), JSON.stringify(kept))
  return kept
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
    source: event.source,
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

/** Each cached placing with a clean verdict, newest first; a list taken to several events is shown once, at its newest placing, as its own page does. */
function placedLists(cached: Events, known: Record<string, Verdict>) {
  const found: WinningList[] = []
  const shown = new Set<string>()
  for (const event of cached)
    for (const player of event.players) {
      const list = known[player.list]
      if (!list || shown.has(player.list)) continue
      shown.add(player.list)
      found.push(placed(list, player.list, event, player))
    }
  return found.toSorted((left, right) => right.event.date.localeCompare(left.event.date) || left.placing - right.placing)
}

/** The lists the last finished import found and the revision it ran under, read without importing anything. */
export async function finishedLists(directory: string) {
  const cached = await readJson(eventsFile(directory), events)
  const finished = await readJson(verdictsFile(directory), verdicts)
  return cached && finished ? { revision: finished.revision, lists: placedLists(cached, finished.lists) } : null
}

/**
 * Every cached placing whose list imports with nothing to review under this catalogue revision, which is what keeps a
 * list built for datasheets or options since removed out, whatever its age; one that is no longer legal, such as after
 * a points rise, is kept with its problem. Verdicts are kept on disk per revision, the last finished import's apart
 * from the one in progress, so a restart repeats no import, a day adds only new lists, and the finished lists stay
 * readable until a new revision's import finishes. `progress` gets those found so far as it goes.
 */
export async function importableLists(
  directory: string,
  revision: string,
  progress: (found: WinningList[]) => void = () => undefined,
): Promise<WinningList[] | null> {
  const cached = await readJson(eventsFile(directory), events)
  if (!cached) return null
  // A cache written in an older shape fails the schema and is read as empty, so every list is imported again.
  const finished = await readJson(verdictsFile(directory), verdicts)
  const checking = await readJson(checkingFile(directory), verdicts)
  const known: Record<string, Verdict> =
    finished?.revision === revision ? finished.lists : checking?.revision === revision ? checking.lists : {}
  let imported = 0
  for (const { list } of cached.flatMap((event) => event.players)) {
    if (list in known) continue
    const text = await fs.readFile(listFile(directory, list), 'utf8').catch(() => null)
    if (text === null) continue
    const started = performance.now()
    known[list] = (await importAndKeep(directory, list, text, revision)).verdict
    const took = performance.now() - started
    // Saved as it goes, so a restart part way through carries on rather than starting again.
    if (++imported % 25 === 0) {
      await writeWhole(checkingFile(directory), JSON.stringify({ revision, lists: known }))
      progress(placedLists(cached, known))
    }
    await sleep(PAUSE_PER_IMPORT * took)
  }
  await writeWhole(verdictsFile(directory), JSON.stringify({ revision, lists: known }))
  await fs.rm(checkingFile(directory), { force: true })
  return placedLists(cached, known)
}

/**
 * A faction's lists legal today, or every one when asked. A faction is its family, so a list imported under one rules
 * version counts towards a roster built under another.
 */
const factionLists = (lists: readonly WinningList[], catalogueId: string, includeNoLongerLegal = false) => {
  const family = currentCatalogueFamilyId(catalogueId)
  return lists.filter((list) => (includeNoLongerLegal || !list.problem) && currentCatalogueFamilyId(list.catalogueId) === family)
}

/** How many of a faction's lists legal today field each datasheet, counting a list once however many copies it takes. */

export function unitCounts(lists: readonly WinningList[], catalogueId: string, battleSize?: number) {
  const faction = factionLists(lists, catalogueId).filter((list) => !battleSize || list.limit === battleSize)
  const units: Record<string, number> = {}
  for (const list of faction) for (const { id } of list.datasheets) units[id] = (units[id] ?? 0) + 1
  return { lists: faction.length, units }
}

/** A faction's lists, counted by family as unitCounts counts them, narrowed to one detachment and one battle size when given. */
export function matchingLists(
  lists: readonly WinningList[],
  catalogueId: string,
  { detachmentId, battleSize, includeNoLongerLegal }: { detachmentId?: string; battleSize?: number; includeNoLongerLegal?: boolean } = {},
) {
  return factionLists(lists, catalogueId, includeNoLongerLegal).filter(
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

/** The faction's lists legal today that field one datasheet, newest first, each with its copies' model counts, out of how many. */
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
 * last finished answer, even one from an earlier revision, or the lists found so far before any import has finished.
 */
export function winningListsStore(directory: string, catalogue: () => LoadedCatalogue | null, onError: (error: unknown) => void) {
  let shown: { lists: WinningList[]; revision: string; version: number; complete: boolean } | null = null
  let version = 0
  let running: Promise<void> | null = null
  const readEvents = () => readJson(eventsFile(directory), events)
  // Only a refresh rewrites the events, so they are read once per refresh rather than per list read.
  let placings: { version: number; events: ReturnType<typeof readEvents> } | null = null
  const cachedEvents = () => {
    placings = placings?.version === version ? placings : { version, events: readEvents() }
    return placings.events
  }
  const read = () => {
    const revision = catalogue()?.index.revision
    if (!revision || running || (shown?.complete && shown.revision === revision && shown.version === version)) return
    const reading = version
    // Lists found so far stand in only for none or for an earlier partial read, never for a finished one.
    const partial = (lists: WinningList[]) => {
      if (!shown?.complete) shown = { lists, revision, version: reading, complete: false }
    }
    running = (async () => {
      // After a restart, the last finished lists stand in while a new revision is checked, rather than a partial set.
      const finished = shown ? null : await finishedLists(directory)
      if (finished) shown = { ...finished, version: reading, complete: true }
      const lists = await importableLists(directory, revision, partial)
      if (lists) shown = { lists, revision, version: reading, complete: true }
    })()
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
    unitCounts: (catalogueId: string, battleSize?: number) => {
      read()
      return shown?.complete ? unitCounts(shown.lists, catalogueId, battleSize) : null
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
    /**
     * One placing with the units it imports as, the draft save_roster takes and its army text, as imported under the
     * current revision and release; null for a list that is not shown. Only a list not yet imported under both is imported now.
     */
    list: async (id: string) => {
      const revision = catalogue()?.index.revision
      if (!LIST_ID.test(id) || !revision) return null
      const event = (await cachedEvents())?.find((candidate) => candidate.players.some((player) => player.list === id))
      const player = event?.players.find((candidate) => candidate.list === id)
      const text = await fs.readFile(listFile(directory, id), 'utf8').catch(() => null)
      if (!event || !player || !text) return null
      const kept = await readJson(importedFile(directory, id), importedSchema)
      const { verdict, draft } =
        kept?.revision === revision && kept.release === release ? kept : await importAndKeep(directory, id, text, revision)
      return verdict && draft ? { list: placed(verdict, id, event, player), units: draft.picks, draft, text } : null
    },
  }
}

export type WinningListsStore = ReturnType<typeof winningListsStore>
