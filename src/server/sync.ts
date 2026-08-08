import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { catalogueSources as sources, SOURCE_NAMES, type SourceName, type WahapediaSource } from './catalogueSources'

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

function pinnedRevisions(): Record<SourceName, string> {
  return {
    definitions: sources.definitions.revision,
    points: sources.points.revision,
    rules: sources.rules.revision,
  }
}

/** What is on disk, or nothing when this instance has never synced. */
function localRevisions(directory: string): Partial<Record<SourceName | 'wahapedia', string>> {
  try {
    const parsed: Partial<Record<SourceName | 'wahapedia', string>> = JSON.parse(
      fs.readFileSync(path.join(directory, REVISION_FILE), 'utf8'),
    )
    return parsed
  } catch {
    return {}
  }
}

export const isCurrent = (directory: string) => {
  const local = localRevisions(directory)
  const pinned = pinnedRevisions()
  return SOURCE_NAMES.every((name) => local[name] === pinned[name] && fs.existsSync(path.join(directory, name)))
}

/**
 * Brings the directory up to the pinned revisions, doing nothing when it already is.
 *
 * Each source lands in a sibling directory first and is swapped in, so a run that
 * dies halfway cannot leave a half-written catalogue that looks complete.
 */
export async function syncSources(
  directory: string,
  report: (message: string) => void = () => {},
  wahapediaSource: WahapediaSource = sources.wahapedia,
): Promise<void> {
  if (isCurrent(directory)) {
    await syncWahapedia(directory, report, wahapediaSource)
    report('catalogue is already at the pinned revisions')
    return
  }

  fs.mkdirSync(directory, { recursive: true })
  const local = localRevisions(directory)
  const pinned = pinnedRevisions()
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
  await syncWahapedia(directory, report, wahapediaSource)
  report('catalogue is ready')
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

  for (const [name, expected] of Object.entries(source.files)) {
    // eslint-disable-next-line no-await-in-loop
    const response = await fetch(`${source.baseUrl}/${name}`)
    if (!response.ok) throw new Error(`Wahapedia ${name} answered ${response.status}`)
    // eslint-disable-next-line no-await-in-loop
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.length > MAX_EXPORT_BYTES) throw new Error(`Wahapedia ${name} exceeds ${MAX_EXPORT_BYTES} bytes`)
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== expected) throw new Error(`Wahapedia ${name} does not match the pinned export`)
    fs.writeFileSync(path.join(staging, name), bytes)
  }

  const pages = path.join(staging, 'pages')
  fs.mkdirSync(pages)
  const unavailable: string[] = []
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
