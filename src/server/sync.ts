import fs from 'node:fs'
import { hash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { z } from 'zod'
import { type BattlemasterSource, type ReleaseSource } from './catalogueSources'
import { boundedBytes } from './boundedBody'
import { fetchWithRetry } from './fetch'
import { battlemasterObjectiveHosts } from './battlemasterObjectives'
import { replaceDirectory } from './replaceDirectory'
import type { SyncStatus } from '../contracts/serviceStatus'

export type SyncState = { status: SyncStatus; detail: string | null }

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

async function boundedDownload(url: URL, label: string, limit: number) {
  const response = await fetchWithRetry(url)
  if (!response.ok) throw new Error(`${label} answered ${response.status}`)
  return boundedBytes(response, limit, `${label} exceeds ${limit} bytes`)
}

/** The mission packs `source` names, Chapter Approved first: its layouts sit at the directory root, any other pack's in a folder named after the pack. */
const missionPacks = (source: BattlemasterSource) => [source.missionPack, ...(source.combatPatrolPack ? [source.combatPatrolPack] : [])]

async function packCatalogue(source: BattlemasterSource, missionPack: string) {
  const url = new URL('/v1.1/public/tts/layouts', source.baseUrl)
  url.searchParams.set('owner', source.owner)
  url.searchParams.set('missionPack', missionPack)
  url.searchParams.set('text', '0')
  const body = parseJson(await boundedDownload(url, `${missionPack} catalog`, MAX_BATTLEMASTER_CATALOG_BYTES))
  if (!battlemasterCatalogSchema.safeParse(body).success) throw new Error('catalog has an unexpected shape')
  // The validated body itself, not the parsed copy, keeps every served field in its order for catalog.json.
  const catalog = body as BattlemasterCatalog
  if (!catalog.catalogKey || !catalog.layouts.length) throw new Error('catalog is empty')
  return catalog
}

/** The live layout catalogue of each of `source`'s packs, and the revision that pins them. */
export async function battlemasterCatalogue(source: BattlemasterSource) {
  const catalogs: { missionPack: string; catalog: BattlemasterCatalog }[] = []
  for (const missionPack of missionPacks(source)) catalogs.push({ missionPack, catalog: await packCatalogue(source, missionPack) })
  // A source naming Chapter Approved alone keeps the revision its snapshots were published under.
  return { catalogs, revision: hash('sha256', catalogs.map(({ catalog }) => catalog.catalogKey).join('\n')) }
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
  const { catalogs, revision } = await battlemasterCatalogue(source)
  if (revision !== source.revision) throw new Error('catalog does not match the pinned revision')

  const cache = cacheRoot ? path.join(cacheRoot, source.revision) : null
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  let total = 0
  let downloaded = false

  for (const { missionPack, catalog } of catalogs) {
    const folder = missionPack === source.missionPack ? '' : missionPack
    fs.mkdirSync(path.join(staging, folder, 'layouts'), { recursive: true })
    fs.writeFileSync(path.join(staging, folder, 'catalog.json'), `${JSON.stringify(catalog)}\n`)
    for (const entry of catalog.layouts) {
      if (!/^terrain-[0-9a-f-]+$/.test(entry.id)) throw new Error(`unsafe layout id ${entry.id}`)
      if (!/^[0-9a-f-]+$/.test(entry.owner)) throw new Error(`unsafe owner id for ${entry.id}`)
      const layout =
        (cache && cachedLayout(path.join(cache, folder), entry, source.baseUrl)) ||
        ((downloaded = true), await downloadLayout(source, entry))
      for (const file of [layout.detail, layout.lite]) {
        if (file && file.length > MAX_BATTLEMASTER_FILE_BYTES) throw new Error(`${entry.id} exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`)
        total += file?.length ?? 0
      }
      if (total > MAX_BATTLEMASTER_TOTAL_BYTES) throw new Error(`layouts exceed ${MAX_BATTLEMASTER_TOTAL_BYTES} bytes`)
      fs.writeFileSync(path.join(staging, folder, 'layouts', `${entry.id}.json`), layout.detail)
      if (layout.lite) {
        battlemasterObjectiveHosts(parseJson(layout.detail), parseJson(layout.lite), entry.id)
        fs.writeFileSync(path.join(staging, folder, 'layouts', `${entry.id}.lite.json`), layout.lite)
      }
    }
  }

  if (cache && downloaded) {
    const incoming = `${cache}.incoming-${randomUUID()}`
    fs.cpSync(staging, incoming, { recursive: true })
    replaceDirectory(incoming, cache)
  }
  replaceDirectory(staging, target)
}

/** A layout's detail, and for a Chapter Approved slot the objective layout that places its markers. */
type BattlemasterLayout = { detail: Uint8Array; lite: Uint8Array | null }

const parseJson = (bytes: Uint8Array) => JSON.parse(new TextDecoder().decode(bytes)) as unknown

/** A cached layout that still matches the live catalogue entry; anything else is downloaded again. */
function cachedLayout(cache: string, entry: BattlemasterCatalog['layouts'][number], baseUrl: string): BattlemasterLayout | null {
  try {
    const detail = new Uint8Array(fs.readFileSync(path.join(cache, 'layouts', `${entry.id}.json`)))
    const parsed = parseJson(detail) as BattlemasterDetail
    const lite = parsed.layout?.chapterApprovedSlot
      ? new Uint8Array(fs.readFileSync(path.join(cache, 'layouts', `${entry.id}.lite.json`)))
      : null
    return battlemasterDetailMatches(entry, parsed, baseUrl) ? { detail, lite } : null
  } catch {
    return null
  }
}

async function downloadLayout(source: BattlemasterSource, entry: BattlemasterCatalog['layouts'][number]): Promise<BattlemasterLayout> {
  const detailUrl = new URL(`/v1/public/data/layouts/${entry.owner}/${entry.id}`, source.baseUrl)
  // Fetch sequentially to avoid bursting the public API.
  const detail = await boundedDownload(detailUrl, entry.id, MAX_BATTLEMASTER_FILE_BYTES)
  const parsed = parseJson(detail) as BattlemasterDetail
  if (!battlemasterDetailMatches(entry, parsed, source.baseUrl)) throw new Error(`${entry.id} changed during sync`)
  const slot = parsed.layout?.chapterApprovedSlot
  if (!slot) return { detail, lite: null }
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
  const lite = await boundedDownload(liteUrl, `${entry.id} objective layout`, MAX_BATTLEMASTER_FILE_BYTES)
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

/** A release archive, checked against its pinned SHA-256 before any file of it is laid out at `target`. */
export async function fetchReleaseInto(source: ReleaseSource, target: string) {
  const url = new URL(`https://github.com/${source.repository}/releases/download/${source.release}/${source.asset}`)
  const archive = await boundedDownload(url, source.asset, MAX_RELEASE_BYTES)
  if (hash('sha256', archive) !== source.revision) throw new Error(`${source.asset} does not match the pinned revision`)
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  for (const [name, bytes] of ustarFiles(archive)) {
    const file = path.resolve(staging, name)
    if (!file.startsWith(`${path.resolve(staging)}${path.sep}`)) throw new Error(`${source.asset} contains an unsafe path`)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
  }
  replaceDirectory(staging, target)
}

// A VS Data release carries the datasheets and points it summarizes as well as the summaries, about 70 MB a rules version.
const MAX_RELEASE_BYTES = 128 * 1024 * 1024

/**
 * The regular files of a ustar archive; any other entry, such as a link, is refused. A PAX extended
 * header gives the next entry the long path the ustar name field cannot hold, and nothing else is read from it.
 */
function* ustarFiles(archive: Uint8Array): Generator<[string, Uint8Array]> {
  const text = (start: number, length: number) => new TextDecoder().decode(archive.subarray(start, start + length)).replace(/\0.*$/s, '')
  let longPath: string | undefined
  for (let at = 0; at + 512 <= archive.length;) {
    if (archive.subarray(at, at + 512).every((byte) => byte === 0)) return
    if (text(at + 257, 5) !== 'ustar') throw new Error('release archive is not ustar')
    const type = text(at + 156, 1)
    const prefix = text(at + 345, 155)
    const name = longPath ?? `${prefix ? `${prefix}/` : ''}${text(at, 100)}`
    const size = Number.parseInt(text(at + 124, 12).trim() || '0', 8)
    if (!Number.isSafeInteger(size) || at + 512 + size > archive.length) throw new Error(`release archive entry ${name} is truncated`)
    const body = archive.slice(at + 512, at + 512 + size)
    longPath = undefined
    if (type === 'x') longPath = /(?:^|\n)\d+ path=([^\n]+)\n/.exec(new TextDecoder().decode(body))?.[1]
    else if (type === '0' || type === '') yield [name, body]
    else if (type !== '5') throw new Error(`release archive entry ${name} is not a regular file`)
    at += 512 + Math.ceil(size / 512) * 512
  }
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
