/**
 * Caches public army lists for `scripts/importCorpus.ts`, one folder per source under
 * ~/.cache/praetorium/import-corpus, outside the repository. Each fetch adds only lists the
 * cache does not hold, so polling keeps lists a rolling feed later drops.
 *
 * It imports nothing from the app, so a schedule can run it straight from `origin/main`:
 *
 *   node scripts/lib/importCorpusSources.ts [40kstats | lexmechanic | listforge | all]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type Listing = { list: string; faction?: string; detachment?: string; event?: string; date?: string }
type Found = Listing & { text: () => Promise<string | null> }

export const CORPUS_ROOT = path.join(os.homedir(), '.cache', 'praetorium', 'import-corpus')
export const SOURCES = ['40kstats', 'lexmechanic', 'listforge'] as const
export type Source = (typeof SOURCES)[number]

const json = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { headers: { 'user-agent': 'praetorium-import-corpus (+https://praetorium.gg)' } })
  if (!response.ok) throw new Error(`${url} answered ${response.status}`)
  return (await response.json()) as T
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** 40kstats.tabletopbattles.com's top-four lists, each list's raw text at its own address. */
async function fortyKStats(): Promise<Found[]> {
  const base = 'https://40kstats.tabletopbattles.com/data'
  const factions = await json<Record<string, Record<string, Omit<Listing, 'faction' | 'detachment'>[]>>>(
    `${base}/reports/factiontopfour.json`,
  )
  return Object.entries(factions).flatMap(([faction, detachments]) =>
    Object.entries(detachments).flatMap(([detachment, players]) =>
      players.map((player) => ({
        ...player,
        faction,
        detachment,
        text: async () => {
          const response = await fetch(`${base}/lists/${player.list}.json`)
          return response.ok ? response.text() : null
        },
      })),
    ),
  )
}

/** Lexmechanic's Meta Merge: about six weeks of lists that went undefeated or lost once, every faction's in one file. */
async function lexmechanic(): Promise<Found[]> {
  const base = 'https://lexmechanic.com/meta'
  const { factions } = await json<{ factions: { slug: string }[] }>(`${base}/index.json`)
  const found: Found[] = []
  for (const { slug } of factions) {
    const { rows } = await json<{
      rows: { listUid: string; faction: string; detachment?: string; eventName?: string; startDate?: string; listText?: string }[]
    }>(`${base}/${slug}.json`)
    for (const row of rows)
      if (row.listText?.trim())
        found.push({
          list: row.listUid,
          faction: row.faction,
          ...(row.detachment ? { detachment: row.detachment } : {}),
          ...(row.eventName ? { event: row.eventName } : {}),
          ...(row.startDate ? { date: row.startDate.slice(0, 10) } : {}),
          text: async () => row.listText!.replaceAll('\r\n', '\n'),
        })
    await pause(1000)
  }
  return found
}

/** ListForge's featured and top shared lists, each read as its short text export. */
async function listForge(): Promise<Found[]> {
  const featured = await json<{ featuredLists: { hexCode: string; faction?: string }[] }>('https://listforge.club/api/featured-lists')
  const top = await json<{ items: { hexCode: string; faction?: string; gameSystem?: string }[] }>(
    'https://list-forge.fly.dev/api/feed/top-posts?period=month&limit=100',
  )
  const shared = [...featured.featuredLists, ...top.items.filter((item) => item.gameSystem === 'wh40k-11e_main')]
  const today = new Date().toISOString().slice(0, 10)
  return shared.map(({ hexCode, faction }) => ({
    list: hexCode,
    ...(faction ? { faction } : {}),
    date: today,
    text: async () => {
      const { payloadUrl } = await json<{ payloadUrl: string }>(`https://list-forge.fly.dev/api/shares/${hexCode}`)
      const payload = await json<{ shortText?: string }>(payloadUrl)
      await pause(500)
      return payload.shortText?.trim() ? payload.shortText : null
    },
  }))
}

const readers: Record<Source, () => Promise<Found[]>> = { '40kstats': fortyKStats, lexmechanic, listforge: listForge }

/** Adds the lists `source` publishes that its cache does not hold yet, and keeps every listing it held before. */
export async function fetchSource(source: Source, root = CORPUS_ROOT) {
  const directory = path.join(root, source)
  fs.mkdirSync(directory, { recursive: true })
  const indexFile = path.join(directory, 'index.json')
  const held: Listing[] = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : []
  const known = new Set(held.map((listing) => listing.list))
  const found = await readers[source]()
  let added = 0
  for (const { text, ...listing } of found) {
    if (known.has(listing.list)) continue
    known.add(listing.list)
    const file = path.join(directory, `${listing.list}.txt`)
    const body = fs.existsSync(file) ? 'cached' : await text().catch(() => null)
    if (body === null) continue
    if (body !== 'cached') fs.writeFileSync(file, body)
    held.push(listing)
    added++
  }
  fs.writeFileSync(indexFile, JSON.stringify(held))
  return { source, added, total: held.length, directory }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const wanted = process.argv[2] ?? 'all'
  const sources = wanted === 'all' ? SOURCES : SOURCES.filter((source) => source === wanted)
  if (!sources.length) throw new Error(`Unknown source ${wanted}: use ${SOURCES.join(', ')} or all`)
  for (const source of sources) {
    try {
      const { added, total, directory } = await fetchSource(source)
      console.log(`${new Date().toISOString()} ${source}: ${added} new, ${total} held, in ${directory}`)
    } catch (error) {
      // One source being down leaves the others to fetch.
      console.error(`${new Date().toISOString()} ${source}: ${String(error)}`)
      process.exitCode = 1
    }
  }
}
