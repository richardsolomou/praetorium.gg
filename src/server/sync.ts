import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { unzipSync } from 'fflate'
import sources from '../../catalogue/sources.json' with { type: 'json' }

/**
 * Fetching the community data an instance needs, without anybody running a script.
 *
 * The sources are imported rather than read from disk so they travel in the bundle:
 * a container has `src` and nothing else. GitHub's zipball is used rather than its
 * tarball because `fflate` already reads zip and Node has no tar — one fewer
 * dependency for the same job.
 */
type SourceName = 'definitions' | 'points' | 'rules'

export const SOURCE_NAMES: SourceName[] = ['definitions', 'points', 'rules']

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
export async function syncSources(directory: string, report: (message: string) => void = () => {}): Promise<void> {
  if (isCurrent(directory)) {
    await syncWahapedia(directory, report)
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
    await fetchInto(source.repository, source.revision, target)
  }
  fs.writeFileSync(path.join(directory, REVISION_FILE), `${JSON.stringify(pinned, null, 2)}\n`)
  await syncWahapedia(directory, report)
  report('catalogue is ready')
}

async function syncWahapedia(directory: string, report: (message: string) => void) {
  const target = path.join(directory, 'wahapedia')
  const complete = Object.keys(sources.wahapedia.files).every((name) => fs.existsSync(path.join(target, name)))
  if (localRevisions(directory).wahapedia === sources.wahapedia.revision && complete) return
  report(`wahapedia: fetching export from ${sources.wahapedia.revision}`)
  try {
    await fetchWahapediaInto(sources.wahapedia, target)
    const revisions = { ...localRevisions(directory), wahapedia: sources.wahapedia.revision }
    fs.writeFileSync(path.join(directory, REVISION_FILE), `${JSON.stringify(revisions, null, 2)}\n`)
  } catch (error) {
    report(`wahapedia: descriptions unavailable (${error instanceof Error ? error.message : String(error)})`)
  }
}

const MAX_EXPORT_BYTES = 5 * 1024 * 1024

async function fetchWahapediaInto(source: (typeof sources)['wahapedia'], target: string) {
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

  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
}

async function fetchInto(repository: string, revision: string, target: string) {
  const response = await fetch(`https://codeload.github.com/${repository}/zip/${revision}`)
  if (!response.ok) throw new Error(`${repository} answered ${response.status}`)

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const staging = `${target}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })

  for (const [entry, bytes] of Object.entries(archive)) {
    // A zipball nests everything under `<repo>-<sha>/`, which is stripped.
    const relative = entry.split('/').slice(1).join('/')
    if (!relative || entry.endsWith('/')) continue
    const file = path.join(staging, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, bytes)
  }

  fs.rmSync(target, { recursive: true, force: true })
  fs.renameSync(staging, target)
}
