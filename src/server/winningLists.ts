import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { z } from 'zod'
import { listUnitCount } from '../core/attachedUnits'
import { rosterUseProblem } from '../core/rosterLegality'
import { calculateRosterPrice } from '../shared/pricing'
import type { LoadedCatalogue } from './catalogueIndex'
import { fetchWithRetry } from './fetch'
import { importRosterInput } from './rosterImport'

const SOURCE = 'https://40kstats.tabletopbattles.com'
/** Older placings are almost all on data a points update has since replaced, and would only fail to import. */
const WINDOW_DAYS = 60
const HEADERS = { 'user-agent': 'praetorium.gg (+https://praetorium.gg)' }
/** An import holds the event loop for about a seventh of a second, so a pause after each keeps requests answering. */
const PAUSE_MS = 100

const LIST_ID = /^[0-9a-f]{32}$/
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
    /** Each datasheet's name once, so a search can find lists by what they field. */
    datasheets: z.array(z.string()),
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

const listFile = (directory: string, id: string) => path.join(directory, 'lists', `${id}.txt`)
const eventsFile = (directory: string) => path.join(directory, 'events.json')
const verdictsFile = (directory: string) => path.join(directory, 'verdicts.json')
const windowStart = (now: number) => new Date(now - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)

/**
 * Brings the cache up to date with 40k Stats' published top-four placings: the event index each time,
 * and only the lists the cache does not hold, one at a time.
 */
export async function refreshWinningLists(directory: string, now = Date.now()) {
  const response = await fetchWithRetry(`${SOURCE}/data/reports/topfour.json`, { headers: HEADERS })
  if (!response.ok) throw new Error(`40k Stats placings answered ${response.status}`)
  const since = windowStart(now)
  const recent = events.parse(await response.json()).filter((event) => event.date >= since)
  await fs.mkdir(path.join(directory, 'lists'), { recursive: true })
  for (const { list } of recent.flatMap((event) => event.players)) {
    if (await fs.stat(listFile(directory, list)).catch(() => null)) continue
    const text = await fetchWithRetry(`${SOURCE}/data/lists/${list}.json`, { headers: HEADERS })
    if (text.ok) await fs.writeFile(listFile(directory, list), await text.text())
  }
  await fs.writeFile(eventsFile(directory), JSON.stringify(recent))
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
    datasheets: [...new Set(priced.units.map((unit) => unit.name))],
    reportedPoints: result.reportedPoints,
  }
  return { verdict, units: result.units }
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
 * Every cached placing in the window whose list imports with nothing to review and is legal under this catalogue
 * revision. Verdicts are kept on disk per revision, so a restart repeats no import and a day adds only new lists.
 */
async function importableLists(directory: string, revision: string, now = Date.now()): Promise<WinningList[] | null> {
  const cached = await readJson(eventsFile(directory), events)
  if (!cached) return null
  const kept = await readJson(verdictsFile(directory), verdicts)
  // A cache written in an older shape fails the schema and is read as empty, so every list is imported again.
  const known: Record<string, Verdict> = kept?.revision === revision ? kept.lists : {}
  const since = windowStart(now)
  const save = () => fs.writeFile(verdictsFile(directory), JSON.stringify({ revision, lists: known }))
  const found: WinningList[] = []
  let imported = 0
  for (const event of cached.filter((candidate) => candidate.date >= since))
    for (const player of event.players) {
      if (!(player.list in known)) {
        const text = await fs.readFile(listFile(directory, player.list), 'utf8').catch(() => null)
        if (text === null) continue
        known[player.list] = await importVerdict(text)
        // Saved as it goes, so a restart part way through carries on rather than starting again.
        if (++imported % 25 === 0) await save()
        await sleep(PAUSE_MS)
      }
      const list = known[player.list]
      if (!list) continue
      found.push(placed(list, player.list, event, player))
    }
  await save()
  return found.toSorted((left, right) => right.event.date.localeCompare(left.event.date) || left.placing - right.placing)
}

/**
 * The importable lists, read again in the background whenever the cache or the catalogue changes. A reader gets the
 * last finished answer straight away, or null before the first one, rather than waiting on any import.
 */
export function winningListsStore(directory: string, catalogue: () => LoadedCatalogue | null, onError: (error: unknown) => void) {
  let shown: { lists: WinningList[]; revision: string; version: number } | null = null
  let version = 0
  let running: Promise<void> | null = null
  const read = () => {
    const revision = catalogue()?.index.revision
    if (!revision || running || (shown?.revision === revision && shown.version === version)) return
    const reading = version
    running = importableLists(directory, revision)
      .then((lists) => {
        if (lists) shown = { lists, revision, version: reading }
      })
      .catch(onError)
      .finally(() => {
        running = null
      })
  }
  return {
    lists: () => {
      read()
      return shown?.lists ?? null
    },
    refresh: async () => {
      await refreshWinningLists(directory)
      version++
      read()
    },
    /** One placing with the units it imports as and its army text, read afresh; null for a list that is not shown. */
    list: async (id: string) => {
      if (!LIST_ID.test(id)) return null
      const event = (await readJson(eventsFile(directory), events))?.find((candidate) =>
        candidate.players.some((player) => player.list === id),
      )
      const player = event?.players.find((candidate) => candidate.list === id)
      const text = await fs.readFile(listFile(directory, id), 'utf8').catch(() => null)
      const imported = event && player && text ? await importWinningList(text) : null
      return imported && event && player && text ? { list: placed(imported.verdict, id, event, player), units: imported.units, text } : null
    },
  }
}

export type WinningListsStore = ReturnType<typeof winningListsStore>
