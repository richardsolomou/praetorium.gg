import fs from 'node:fs'
import { hash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { z } from 'zod'
import { type BattlemasterSource } from './catalogueSources'
import { boundedBytes } from './boundedBody'
import { fetchWithRetry } from './fetch'
import { battlemasterObjectiveHosts } from './battlemasterObjectives'
import { replaceDirectory } from './replaceDirectory'

export type SyncState = { status: 'absent' | 'working' | 'ready' | 'failed'; detail: string | null }

const battlemasterCatalogSchema = z.object({
  catalogKey: z.string(),
  layouts: z.array(
    z.object({
      id: z.string(),
      owner: z.string(),
      ownerUsername: z.string().optional(),
      name: z.string().optional(),
      updatedAt: z.string().optional(),
      layoutKey: z.string(),
    }),
  ),
})
type BattlemasterCatalog = z.infer<typeof battlemasterCatalogSchema>

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
// The 45-layout catalogue is about 42 KB; this leaves room for it to grow twentyfold.
const MAX_BATTLEMASTER_CATALOG_BYTES = 1024 * 1024

/** The live layout catalogue for `source` and the revision that pins it. */
export async function battlemasterCatalogue(source: BattlemasterSource) {
  const url = new URL('/v1.1/public/tts/layouts', source.baseUrl)
  url.searchParams.set('owner', source.owner)
  url.searchParams.set('missionPack', source.missionPack)
  url.searchParams.set('text', '0')
  const response = await fetchWithRetry(url)
  if (!response.ok) throw new Error(`catalog answered ${response.status}`)
  const body = parseJson(
    await boundedBytes(response, MAX_BATTLEMASTER_CATALOG_BYTES, `catalog exceeds ${MAX_BATTLEMASTER_CATALOG_BYTES} bytes`),
  )
  if (!battlemasterCatalogSchema.safeParse(body).success) throw new Error('catalog has an unexpected shape')
  // The validated body itself, not the parsed copy, keeps every served field in its order for catalog.json.
  const catalog = body as BattlemasterCatalog
  if (!catalog.catalogKey || !catalog.layouts.length) throw new Error('catalog is empty')
  return { catalog, revision: hash('sha256', catalog.catalogKey) }
}

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
  const { catalog, revision } = await battlemasterCatalogue(source)
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
    replaceDirectory(incoming, cache)
  }
  replaceDirectory(staging, target)
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
  const detail = await boundedBytes(detailResponse, MAX_BATTLEMASTER_FILE_BYTES, `${entry.id} exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`)
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
  const lite = await boundedBytes(
    liteResponse,
    MAX_BATTLEMASTER_FILE_BYTES,
    `${entry.id} objective layout exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`,
  )
  return { detail, lite }
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
  const archive = await boundedBytes(response, MAX_ARCHIVE_BYTES, `${repository} archive exceeds ${MAX_ARCHIVE_BYTES} bytes`)
  extractSourceArchive(archive, repository, target, sourcePath)
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

  replaceDirectory(staging, target)
}
