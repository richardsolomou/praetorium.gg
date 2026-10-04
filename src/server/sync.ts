import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { type BattlemasterSource } from './catalogueSources'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'
import { fetchWithRetry } from './fetch'

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
  }
}

const MAX_BATTLEMASTER_FILE_BYTES = 5 * 1024 * 1024
const MAX_BATTLEMASTER_TOTAL_BYTES = 64 * 1024 * 1024

export async function fetchBattlemasterInto(source: BattlemasterSource, target: string) {
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

  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(path.join(staging, 'layouts'), { recursive: true })
  fs.writeFileSync(path.join(staging, 'catalog.json'), `${JSON.stringify(catalog)}\n`)
  let total = 0

  for (const entry of catalog.layouts) {
    if (!/^terrain-[0-9a-f-]+$/.test(entry.id)) throw new Error(`unsafe layout id ${entry.id}`)
    if (!/^[0-9a-f-]+$/.test(entry.owner)) throw new Error(`unsafe owner id for ${entry.id}`)
    const detailUrl = new URL(`/v1/public/data/layouts/${entry.owner}/${entry.id}`, source.baseUrl)
    // Deliberately sequential: the public API and small production instances should
    // not absorb a 45-request burst for data that changes only when the pin moves.
    const detailResponse = await fetchWithRetry(detailUrl)
    if (!detailResponse.ok) throw new Error(`${entry.id} answered ${detailResponse.status}`)
    const bytes = new Uint8Array(await detailResponse.arrayBuffer())
    if (bytes.length > MAX_BATTLEMASTER_FILE_BYTES) throw new Error(`${entry.id} exceeds ${MAX_BATTLEMASTER_FILE_BYTES} bytes`)
    total += bytes.length
    if (total > MAX_BATTLEMASTER_TOTAL_BYTES) throw new Error(`layouts exceed ${MAX_BATTLEMASTER_TOTAL_BYTES} bytes`)
    const detail = JSON.parse(new TextDecoder().decode(bytes)) as BattlemasterDetail
    if (!battlemasterDetailMatches(entry, detail, source.baseUrl)) throw new Error(`${entry.id} changed during sync`)
    fs.writeFileSync(path.join(staging, 'layouts', `${entry.id}.json`), bytes)
  }

  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
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
  try {
    const page = new URL(detail.layout.links.page)
    return page.origin === new URL(baseUrl).origin && page.pathname === `/community/layout/${entry.owner}/${entry.id}`
  } catch {
    return false
  }
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
