import fs from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { type BattlemasterSource } from './catalogueSources'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'
import { fetchWithRetry } from './fetch'
import { battlemasterObjectiveHosts } from './battlemasterObjectives'

export type SyncState = { status: 'absent' | 'working' | 'ready' | 'failed'; detail: string | null }

const MAX_FACTION_ICON_BYTES = 256 * 1024

export async function syncFactionIcons(directory: string, report: (message: string) => void = () => {}) {
  const factions = SUPPLEMENTAL_FACTION_ICONS.map((faction) => ({ id: faction.id, logo_url: faction.logoUrl }))
  const target = path.join(directory, 'faction-icons')
  if (factions.length && factions.every((faction) => fs.existsSync(path.join(target, `${faction.id}.svg`)))) return

  report('faction icons: fetching licensed artwork')
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })
  for (const faction of factions) {
    if (!/^[a-z0-9-]+$/.test(faction.id)) throw new Error(`unsafe faction id ${faction.id}`)
    const url = new URL(faction.logo_url)
    if (url.hostname !== 'cdn.jsdelivr.net' || !url.pathname.includes('/gh/Certseeds/wh40k-icon@')) {
      throw new Error(`untrusted faction icon for ${faction.id}`)
    }
    const response = await fetchWithRetry(url)
    if (!response.ok) throw new Error(`${faction.id} icon answered ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > MAX_FACTION_ICON_BYTES) throw new Error(`${faction.id} icon exceeds ${MAX_FACTION_ICON_BYTES} bytes`)
    const svg = new TextDecoder().decode(bytes)
    if (!/<svg[\s>]/.test(svg) || /<script[\s>]/i.test(svg)) throw new Error(`${faction.id} icon is not a safe SVG`)
    fs.writeFileSync(path.join(staging, `${faction.id}.svg`), bytes)
  }
  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
}

type BattlemasterCatalog = {
  catalogKey: string
  layouts: {
    id: string
    owner: string
    ownerUsername?: string
    name?: string
    updatedAt?: string
    layoutKey: string
  }[]
}

type BattlemasterDetail = {
  format?: string
  layout?: {
    id?: string
    layoutKey?: string
    name?: string
    owner?: string
    updatedAt?: string
    links?: { page?: string }
    chapterApprovedSlot?: { archetypeA: string; archetypeB: string; slotIndex: number }
    chapterApprovedDeploymentKey?: number
  }
  terrain?: { footprint: { origin: { x: number; y: number }; widthIn: number; heightIn: number; rotationDeg: number } }[]
}

const MAX_BATTLEMASTER_FILE_BYTES = 5 * 1024 * 1024
const MAX_BATTLEMASTER_TOTAL_BYTES = 64 * 1024 * 1024

/**
 * Battlemaster layouts for the pinned catalogue. With `cacheRoot`, layouts kept from an earlier
 * download of the same catalogue revision are reused when they still match the live catalogue's
 * layout keys, and the cache is refreshed after any download.
 */
export async function fetchBattlemasterInto(
  source: BattlemasterSource,
  target: string,
  cacheRoot = process.env.CATALOGUE_BATTLEMASTER_CACHE?.trim() || null,
) {
  const catalogUrl = new URL('/v1.1/public/tts/layouts', source.baseUrl)
  catalogUrl.searchParams.set('owner', source.owner)
  catalogUrl.searchParams.set('missionPack', source.missionPack)
  catalogUrl.searchParams.set('text', '0')
  const response = await fetchWithRetry(catalogUrl)
  if (!response.ok) throw new Error(`catalog answered ${response.status}`)
  const catalog = (await response.json()) as BattlemasterCatalog
  if (!catalog.catalogKey || !catalog.layouts?.length) throw new Error('catalog is empty')
  const revision = createHash('sha256').update(catalog.catalogKey).digest('hex')
  if (revision !== source.revision) throw new Error('catalog does not match the pinned revision')

  const cache = cacheRoot ? path.join(cacheRoot, source.revision) : null
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(path.join(staging, 'layouts'), { recursive: true })
  fs.writeFileSync(path.join(staging, 'catalog.json'), `${JSON.stringify(catalog)}\n`)
  let total = 0
  let downloaded = false

  for (const entry of catalog.layouts) {
    if (!/^terrain-[0-9a-f-]+$/.test(entry.id)) throw new Error(`unsafe layout id ${entry.id}`)
    if (!/^[0-9a-f-]+$/.test(entry.owner)) throw new Error(`unsafe owner id for ${entry.id}`)
    const layout = (cache && cachedLayout(cache, entry, source.baseUrl)) || ((downloaded = true), await downloadLayout(source, entry))
    if (layout.detail.length > MAX_BATTLEMASTER_FILE_BYTES) throw new Error(`${entry.id} exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`)
    if (layout.lite.length > MAX_BATTLEMASTER_FILE_BYTES)
      throw new Error(`${entry.id} objective layout exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`)
    total += layout.detail.length + layout.lite.length
    if (total > MAX_BATTLEMASTER_TOTAL_BYTES) throw new Error(`layouts exceed ${MAX_BATTLEMASTER_TOTAL_BYTES} bytes`)
    battlemasterObjectiveHosts(parseJson(layout.detail), parseJson(layout.lite), entry.id)
    fs.writeFileSync(path.join(staging, 'layouts', `${entry.id}.json`), layout.detail)
    fs.writeFileSync(path.join(staging, 'layouts', `${entry.id}.lite.json`), layout.lite)
  }

  if (cache && downloaded) {
    const incoming = `${cache}.incoming-${randomUUID()}`
    fs.cpSync(staging, incoming, { recursive: true })
    fs.rmSync(cache, { recursive: true, force: true })
    fs.renameSync(incoming, cache)
  }
  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
}

type BattlemasterLayout = { detail: Uint8Array; lite: Uint8Array }

const parseJson = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as unknown

/** A cached layout that still matches the live catalogue entry; anything else is downloaded again. */
function cachedLayout(cache: string, entry: BattlemasterCatalog['layouts'][number], baseUrl: string): BattlemasterLayout | null {
  try {
    const detail = new Uint8Array(fs.readFileSync(path.join(cache, 'layouts', `${entry.id}.json`)))
    const lite = new Uint8Array(fs.readFileSync(path.join(cache, 'layouts', `${entry.id}.lite.json`)))
    return battlemasterDetailMatches(entry, parseJson(detail) as BattlemasterDetail, baseUrl) ? { detail, lite } : null
  } catch {
    return null
  }
}

async function downloadLayout(source: BattlemasterSource, entry: BattlemasterCatalog['layouts'][number]): Promise<BattlemasterLayout> {
  const detailUrl = new URL(`/v1/public/data/layouts/${entry.owner}/${entry.id}`, source.baseUrl)
  // Fetch sequentially to avoid bursting the public API.
  const detailResponse = await fetchWithRetry(detailUrl)
  if (!detailResponse.ok) throw new Error(`${entry.id} answered ${detailResponse.status}`)
  const detail = new Uint8Array(await detailResponse.arrayBuffer())
  if (detail.length > MAX_BATTLEMASTER_FILE_BYTES) throw new Error(`${entry.id} exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`)
  const parsed = parseJson(detail) as BattlemasterDetail
  if (!battlemasterDetailMatches(entry, parsed, source.baseUrl)) throw new Error(`${entry.id} changed during sync`)
  const slot = parsed.layout?.chapterApprovedSlot
  if (!slot) throw new Error(`${entry.id} has no Chapter Approved slot`)
  const liteUrl = new URL('/v1/public/tts/chapter-approved-layout-lite', source.baseUrl)
  for (const [key, value] of Object.entries({
    owner: source.owner,
    archetypeA: slot.archetypeA,
    archetypeB: slot.archetypeB,
    slot: String(slot.slotIndex),
    text: '0',
  })) {
    liteUrl.searchParams.set(key, value)
  }
  const liteResponse = await fetchWithRetry(liteUrl)
  if (!liteResponse.ok) throw new Error(`${entry.id} objective layout answered ${liteResponse.status}`)
  return { detail, lite: new Uint8Array(await liteResponse.arrayBuffer()) }
}

function battlemasterDetailMatches(entry: BattlemasterCatalog['layouts'][number], detail: BattlemasterDetail, baseUrl: string) {
  if (detail.layout?.id === entry.id && detail.layout.layoutKey === entry.layoutKey) return true
  if (
    detail.format !== 'battlemaster.data.layout' ||
    !entry.name ||
    !entry.ownerUsername ||
    !entry.updatedAt ||
    detail.layout?.name !== entry.name ||
    detail.layout.owner !== entry.ownerUsername ||
    detail.layout.updatedAt !== entry.updatedAt ||
    !detail.layout.links?.page
  ) {
    return false
  }
  const page = URL.parse(detail.layout.links.page)
  return page?.origin === URL.parse(baseUrl)?.origin && page?.pathname === `/community/layout/${entry.owner}/${entry.id}`
}

const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024

export async function fetchInto(repository: string, revision: string, target: string, sourcePath?: string) {
  const response = await fetchWithRetry(`https://codeload.github.com/${repository}/zip/${revision}`)
  if (!response.ok) throw new Error(`${repository} answered ${response.status}`)
  extractSourceArchive(new Uint8Array(await response.arrayBuffer()), repository, target, sourcePath)
}

/**
 * One source's zip, laid out at `target` as a synced catalogue holds it: the archive's single
 * top-level directory stripped, only `sourcePath` kept, and the whole swapped in at once.
 */
export function extractSourceArchive(compressed: Uint8Array, repository: string, target: string, sourcePath?: string) {
  if (compressed.length > MAX_ARCHIVE_BYTES) throw new Error(`${repository} archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
  const archive = unzipSync(compressed)
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  const stagingRoot = `${path.resolve(staging)}${path.sep}`
  let extracted = 0

  for (const [entry, bytes] of Object.entries(archive)) {
    // A zipball nests everything under `<repo>-<sha>/`, which is stripped.
    const relative = entry.split('/').slice(1).join('/')
    if (!relative || entry.endsWith('/')) continue
    if (sourcePath && relative !== sourcePath && !relative.startsWith(`${sourcePath}/`)) continue
    const file = path.resolve(staging, relative)
    if (!file.startsWith(stagingRoot)) throw new Error(`${repository} archive contains an unsafe path`)
    extracted += bytes.length
    if (extracted > MAX_EXTRACTED_BYTES) throw new Error(`${repository} expands beyond ${MAX_EXTRACTED_BYTES} bytes`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
  }

  if (!extracted) throw new Error(`${repository} archive contains no files under ${sourcePath ?? 'its root'}`)

  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
}
