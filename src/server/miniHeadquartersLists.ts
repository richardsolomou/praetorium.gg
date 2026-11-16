import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fetchWithRetry } from './fetch'
import { replaceFile } from './replaceFile'

export const MINI_HEADQUARTERS = 'https://miniheadquarters.com'
const TOURNAMENTS = `${MINI_HEADQUARTERS}/tournaments/individual`
const HEADERS = { 'user-agent': 'praetorium.gg (+https://praetorium.gg)' }
const PAUSE_MS = 1000
/** As far back as 40k Stats' placings reach, so neither source outweighs the other with older events. */
const WINDOW_DAYS = 180
/** Results and lists can be published after an event ends, so one without them is checked again until it is this old. */
const SETTLED_DAYS = 14
const MAX_PAGES = 20
const TOP_FOUR = 4
/** A top four out of fewer players says little about a list; 40k Stats' smallest events are about twice this. */
const MIN_PLAYERS = 12

export type Placing = { ranking: number; record: string; list: string }
export type MiniHeadquartersEvent = {
  eventId: string
  name: string
  url: string
  date: string
  rounds: number
  player_count: number
  players: Placing[]
  source: 'miniheadquarters'
}

const NAMED: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', copy: '©' }
const decoded = (text: string) =>
  text.replaceAll(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
    if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)))
    return NAMED[code.toLowerCase()] ?? entity
  })
const plain = (html: string) =>
  decoded(html.replaceAll(/<[^>]+>/g, ''))
    .replaceAll(/\s+/g, ' ')
    .trim()

/** The date an event's address ends with, which is the day it was played once it has finished. */
const slugDate = (slug: string) => slug.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? null

/** Each event address on a page of finished tournaments. */
export function listedEvents(html: string) {
  return [...new Set([...html.matchAll(/\/tournaments\/individual\/details\/([a-z0-9-]+)"/g)].map((match) => match[1]!))]
}

/** Every player's final ranking, name and record from an event's results page, and how many rounds it played. */
export function eventResults(html: string, slug: string) {
  const name = plain(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').replace(/\s*\|\s*MiniHeadQuarters$/i, '')
  const rounds = new Set([...html.matchAll(new RegExp(`/results/${slug}/round/(\\d+)`, 'g'))].map((match) => match[1])).size
  const players = html
    .split('<article')
    .slice(1)
    .flatMap((article) => {
      const ranking = article.match(/text-2xl font-bold text-orange-400">\s*(\d+)\s*</)?.[1]
      const player = article.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1]
      if (!ranking || !player) return []
      const games = [...article.matchAll(/<span class="font-semibold text-\w+-400">([WLD])<\/span>/g)].map((match) => match[1])
      const tally = (result: string) => games.filter((game) => game === result).length
      return [{ ranking: Number(ranking), player: plain(player), record: `W${tally('W')} L${tally('L')} D${tally('D')}` }]
    })
  return { name, rounds, players }
}

/** Each army list on an event's lists page, by the "player - faction" label it is shown under. */
export function eventLists(html: string) {
  return html
    .split('<article')
    .slice(1)
    .flatMap((article) => {
      const label = article.match(/<span class="text-base font-semibold[^"]*">([\s\S]*?)<\/span>/)?.[1]
      const body = article.match(/<div[^>]*whitespace-pre-line[^>]*>([\s\S]*?)<\/div>/)?.[1]
      if (!label || !body) return []
      const text = decoded(body.replaceAll(/<br\s*\/?>/g, '\n').replaceAll(/<[^>]+>/g, '')).trim()
      return text ? [{ label: plain(label), text }] : []
    })
}

/** A player's list, matched by the name that starts its label, since the label goes on to name the faction. */
const listOf = (lists: readonly { label: string; text: string }[], player: string) =>
  lists.find(({ label }) => label === player || label.startsWith(`${player} - `))?.text

/** A stable id in the shape 40k Stats' list ids take, so both sources share one cache and one address. */
const listId = (slug: string, ranking: number) =>
  createHash('sha256').update(`miniheadquarters ${slug} ${ranking}`).digest('hex').slice(0, 32)

const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)

async function page(url: string) {
  const response = await fetchWithRetry(url, { headers: HEADERS })
  await sleep(PAUSE_MS)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Mini Headquarters answered ${response.status}`)
  return response.text()
}

/**
 * Fetches Mini Headquarters' finished Warhammer 40,000 events from the last six months that the cache does not hold,
 * writing each top-four placing's list into `lists` beside 40k Stats' own, then returns every cached event in that
 * window. An event is fetched once; player names only match a ranking to its list and are never kept. A failed fetch
 * still returns what the cache holds, with the error to report.
 */
export async function miniHeadquartersEvents(
  directory: string,
  writeList: (id: string, text: string) => Promise<void>,
  now = new Date(),
): Promise<{ events: MiniHeadquartersEvent[]; failure: unknown }> {
  const cache = path.join(directory, 'miniheadquarters')
  await fs.mkdir(cache, { recursive: true })
  const since = daysBefore(now, WINDOW_DAYS)
  let failure: unknown = null
  try {
    await fetchNewEvents(cache, writeList, now, since)
  } catch (error) {
    failure = error
  }
  const events: MiniHeadquartersEvent[] = []
  for (const file of await fs.readdir(cache)) {
    if (!file.endsWith('.json')) continue
    const event = JSON.parse(await fs.readFile(path.join(cache, file), 'utf8')) as MiniHeadquartersEvent
    if (event.date >= since) events.push(event)
  }
  return { events, failure }
}

async function fetchNewEvents(cache: string, writeList: (id: string, text: string) => Promise<void>, now: Date, since: string) {
  const today = now.toISOString().slice(0, 10)
  const slugs: string[] = []
  for (let number = 1; number <= MAX_PAGES; number++) {
    const found = listedEvents((await page(`${TOURNAMENTS}/?game_system=1&status=STATUS_ENDED&page_size=48&page=${number}`)) ?? '')
    // Pages run roughly newest first, so the first page with nothing in the window is the last one worth reading.
    const dated = found.filter((slug) => {
      const date = slugDate(slug)
      return date && date >= since && date <= today
    })
    slugs.push(...dated)
    if (!dated.length) break
  }
  for (const slug of new Set(slugs)) {
    const file = path.join(cache, `${slug}.json`)
    if (await fs.stat(file).catch(() => null)) continue
    const date = slugDate(slug)!
    const { name, rounds, players } = eventResults((await page(`${TOURNAMENTS}/results/${slug}`)) ?? '', slug)
    const settled = date < daysBefore(now, SETTLED_DAYS)
    // A finished event without results, such as a cancelled one, is kept empty once settled so it is not asked for again.
    if (!players.length && !settled) continue
    const placed = players.length >= MIN_PLAYERS ? players.filter((candidate) => candidate.ranking <= TOP_FOUR) : []
    const lists = placed.length ? eventLists((await page(`${TOURNAMENTS}/army-lists/${slug}`)) ?? '') : []
    const placings: Placing[] = []
    for (const { ranking, player, record } of placed) {
      const text = listOf(lists, player)
      if (!text) continue
      const id = listId(slug, ranking)
      await writeList(id, text)
      placings.push({ ranking, record, list: id })
    }
    if (placed.length && !placings.length && !settled) continue
    const event: MiniHeadquartersEvent = {
      eventId: slug,
      name,
      url: `${TOURNAMENTS}/results/${slug}`,
      date,
      rounds,
      player_count: players.length,
      players: placings,
      source: 'miniheadquarters',
    }
    await replaceFile(file, (temporary) => fs.writeFile(temporary, JSON.stringify(event)))
  }
}
