import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { type BattlemasterSource, type ResolvedCatalogueSources, SOURCE_NAMES, type SourceName } from './catalogueSources'
import { SUPPLEMENTAL_FACTION_ICONS } from './factionIconSources'
import { fetchWithRetry } from './fetch'

/**
 * Fetching the community data an instance needs, without anybody running a script.
 *
 * The sources are imported rather than read from disk so they travel in the bundle:
 * a container has `src` and nothing else. GitHub's zipball is used rather than its
 * tarball because `fflate` already reads zip and Node has no tar — one fewer
 * dependency for the same job.
 */
export type SyncState = { status: 'absent' | 'working' | 'ready' | 'failed'; detail: string | null }

const REVISION_FILE = 'revision.json'

function pinnedRevisions(sources: ResolvedCatalogueSources): Record<SourceName, string> {
  return {
    definitions: sources.definitions.revision,
    points: sources.points.revision,
    rules: sources.rules.revision,
    datacards: sources.datacards.revision,
  }
}

/** What is on disk, or nothing when this instance has never synced. */
function localRevisions(directory: string): Partial<Record<SourceName | 'battlemaster', string>> {
  try {
    const parsed: Partial<Record<SourceName | 'battlemaster', string>> = JSON.parse(
      fs.readFileSync(path.join(directory, REVISION_FILE), 'utf8'),
    )
    return parsed
  } catch {
    return {}
  }
}

export const isCurrent = (directory: string, sources: ResolvedCatalogueSources) => {
  const local = localRevisions(directory)
  const pinned = pinnedRevisions(sources)
  return SOURCE_NAMES.every((name) => local[name] === pinned[name] && fs.existsSync(path.join(directory, name)))
}

/** Publication gate: every optional source must be complete too. */
export const isComplete = (directory: string, sources: ResolvedCatalogueSources) => {
  const local = localRevisions(directory)
  if (!isCurrent(directory, sources)) return false
  if (local.battlemaster !== sources.battlemaster.revision) return false
  const layouts = path.join(directory, 'battlemaster', 'layouts')
  if (!fs.existsSync(layouts) || !fs.readdirSync(layouts).length) return false
  return true
}

/**
 * Brings the directory up to the pinned revisions, doing nothing when it already is.
 *
 * Each source lands in a sibling directory first and is swapped in, so a run that
 * dies halfway cannot leave a half-written catalogue that looks complete.
 */
export async function syncSources(
  directory: string,
  sources: ResolvedCatalogueSources,
  report: (message: string) => void = () => {},
): Promise<void> {
  if (isCurrent(directory, sources)) {
    await syncFactionIcons(directory, report)
    await syncBattlemaster(directory, report, sources.battlemaster)
    report('catalogue is already at the pinned revisions')
    return
  }

  fs.mkdirSync(directory, { recursive: true })
  const local = localRevisions(directory)
  const pinned = pinnedRevisions(sources)
  for (const name of SOURCE_NAMES) {
    const target = path.join(directory, name)
    if (local[name] === pinned[name] && fs.existsSync(target)) {
      report(`${name}: already at the pinned revision`)
      continue
    }
    // Deliberately one at a time: unzipping three archives together would spike
    // well past what a small instance has.
    const source = sources[name]
    report(`${name}: fetching ${source.repository} at ${source.revision.slice(0, 10)}`)
    await fetchInto(source.repository, source.revision, target, 'path' in source ? source.path : undefined)
  }
  fs.writeFileSync(path.join(directory, REVISION_FILE), `${JSON.stringify(pinned, null, 2)}\n`)
  await syncFactionIcons(directory, report)
  await syncBattlemaster(directory, report, sources.battlemaster)
  report('catalogue is ready')
}

const MAX_FACTION_ICON_BYTES = 256 * 1024

async function syncFactionIcons(directory: string, report: (message: string) => void) {
  const core = path.join(directory, 'rules', 'data', 'core')
  if (!fs.existsSync(core)) return
  const factions = fs
    .readdirSync(core, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .flatMap((entry) => {
      const file = path.join(core, entry.name, 'factions.json')
      if (!fs.existsSync(file)) return []
      return (JSON.parse(fs.readFileSync(file, 'utf8')) as { id?: string; logo_url?: string }[]).filter(
        (faction): faction is { id: string; logo_url: string } => Boolean(faction.id && faction.logo_url),
      )
    })
    .concat(SUPPLEMENTAL_FACTION_ICONS.map((faction) => ({ id: faction.id, logo_url: faction.logoUrl })))
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

async function syncBattlemaster(directory: string, report: (message: string) => void, source: BattlemasterSource) {
  const target = path.join(directory, 'battlemaster')
  if (localRevisions(directory).battlemaster === source.revision && fs.existsSync(target)) return
  report(`battlemaster: fetching ${source.missionPack} terrain geometry`)
  try {
    await fetchBattlemasterInto(source, target)
    const revisions = { ...localRevisions(directory), battlemaster: source.revision }
    fs.writeFileSync(path.join(directory, REVISION_FILE), `${JSON.stringify(revisions, null, 2)}\n`)
  } catch (error) {
    report(`battlemaster: terrain geometry unavailable (${error instanceof Error ? error.message : String(error)})`)
  }
}

async function fetchBattlemasterInto(source: BattlemasterSource, target: string) {
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

async function fetchInto(repository: string, revision: string, target: string, sourcePath?: string) {
  const response = await fetchWithRetry(`https://codeload.github.com/${repository}/zip/${revision}`)
  if (!response.ok) throw new Error(`${repository} answered ${response.status}`)

  const compressed = new Uint8Array(await response.arrayBuffer())
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
