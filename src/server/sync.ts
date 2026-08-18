import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import {
  SOURCE_NAMES,
  type BattlemasterSource,
  type ResolvedCatalogueSources,
  type SourceName,
  type WahapediaSource,
} from './catalogueSources'

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
function localRevisions(directory: string): Partial<Record<SourceName | 'battlemaster' | 'wahapedia', string>> {
  try {
    const parsed: Partial<Record<SourceName | 'wahapedia', string>> = JSON.parse(
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
  if (local.wahapedia !== sources.wahapedia.revision) return false
  for (const [name, expected] of Object.entries(sources.wahapedia.files)) {
    const file = path.join(directory, 'wahapedia', name)
    if (!fs.existsSync(file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) return false
  }
  for (const [name, expected] of Object.entries(sources.wahapedia.pages)) {
    const file = path.join(directory, 'wahapedia', 'pages', `${name}.html`)
    if (!fs.existsSync(file) || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== expected) return false
  }
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
    await syncBattlemaster(directory, report, sources.battlemaster)
    await syncWahapedia(directory, report, sources.wahapedia)
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
    // eslint-disable-next-line no-await-in-loop
    await fetchInto(source.repository, source.revision, target, 'path' in source ? source.path : undefined)
  }
  fs.writeFileSync(path.join(directory, REVISION_FILE), `${JSON.stringify(pinned, null, 2)}\n`)
  await syncBattlemaster(directory, report, sources.battlemaster)
  await syncWahapedia(directory, report, sources.wahapedia)
  report('catalogue is ready')
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
  const response = await fetch(catalogUrl)
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
    // eslint-disable-next-line no-await-in-loop
    const detailResponse = await fetch(detailUrl)
    if (!detailResponse.ok) throw new Error(`${entry.id} answered ${detailResponse.status}`)
    // eslint-disable-next-line no-await-in-loop
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

async function syncWahapedia(directory: string, report: (message: string) => void, source: WahapediaSource) {
  const target = path.join(directory, 'wahapedia')
  const complete = Object.keys(source.files).every((name) => fs.existsSync(path.join(target, name)))
  if (localRevisions(directory).wahapedia === source.revision && complete) return
  report(`wahapedia: fetching export from ${source.revision}`)
  try {
    const unavailable = await fetchWahapediaInto(source, target)
    if (unavailable.length) {
      report(`wahapedia: descriptions unavailable for ${unavailable.join(', ')}`)
    }
    const revisions = { ...localRevisions(directory), wahapedia: source.revision }
    fs.writeFileSync(path.join(directory, REVISION_FILE), `${JSON.stringify(revisions, null, 2)}\n`)
  } catch (error) {
    report(`wahapedia: descriptions unavailable (${error instanceof Error ? error.message : String(error)})`)
  }
}

const MAX_EXPORT_BYTES = 5 * 1024 * 1024
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024

async function fetchWahapediaInto(source: WahapediaSource, target: string) {
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  fs.mkdirSync(staging, { recursive: true })

  const unavailable: string[] = []
  for (const [name, expected] of Object.entries(source.files)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${source.baseUrl}/${name}`)
      if (!response.ok) throw new Error(`answered ${response.status}`)
      // eslint-disable-next-line no-await-in-loop
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > MAX_EXPORT_BYTES) throw new Error(`exceeds ${MAX_EXPORT_BYTES} bytes`)
      const actual = createHash('sha256').update(bytes).digest('hex')
      if (actual !== expected) throw new Error('does not match the pinned export')
      fs.writeFileSync(path.join(staging, name), bytes)
    } catch {
      const existing = path.join(target, name)
      if (fs.existsSync(existing) && createHash('sha256').update(fs.readFileSync(existing)).digest('hex') === expected) {
        fs.copyFileSync(existing, path.join(staging, name))
      } else {
        unavailable.push(name)
      }
    }
  }

  const pages = path.join(staging, 'pages')
  fs.mkdirSync(pages)
  for (const [name, expected] of Object.entries(source.pages)) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(`${source.baseUrl}/factions/${name}/`)
      if (!response.ok) throw new Error(`answered ${response.status}`)
      // eslint-disable-next-line no-await-in-loop
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.length > MAX_EXPORT_BYTES) throw new Error(`exceeds ${MAX_EXPORT_BYTES} bytes`)
      const actual = createHash('sha256').update(bytes).digest('hex')
      if (actual !== expected) throw new Error('does not match the pinned source')
      fs.writeFileSync(path.join(pages, `${name}.html`), bytes)
    } catch {
      const existing = path.join(target, 'pages', `${name}.html`)
      if (fs.existsSync(existing) && createHash('sha256').update(fs.readFileSync(existing)).digest('hex') === expected) {
        fs.copyFileSync(existing, path.join(pages, `${name}.html`))
      } else {
        unavailable.push(name)
      }
    }
  }

  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
  return unavailable
}

async function fetchInto(repository: string, revision: string, target: string, sourcePath?: string) {
  const response = await fetch(`https://codeload.github.com/${repository}/zip/${revision}`)
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
