import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { unzipSync, zipSync, type Zippable } from 'fflate'

const FORMAT = 'praetorium.catalogue.v1'
const POINTER_FORMAT = 'praetorium.catalogue-pointer.v1'
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024

/** The shared public store; operators may override it with their own mirror. */
export const DEFAULT_CATALOGUE_SNAPSHOT_BASE_URL = 'https://s3.praetorium.gg/praetorium-catalogue'

type SnapshotManifest = {
  format: typeof FORMAT
  revisions: Record<string, string>
  files: Record<string, string>
}

export type SnapshotPointer = {
  format: typeof POINTER_FORMAT
  id: string
  archiveSha256: string
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

function filesUnder(directory: string, relative = ''): string[] {
  return fs
    .readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.posix.join(relative, entry.name)
      return entry.isDirectory() ? filesUnder(directory, name) : [name]
    })
    .toSorted()
}

function requireComplete(directory: string) {
  const revisions = JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')) as Record<string, string>
  for (const name of ['definitions', 'points', 'rules', 'datacards', 'battlemaster', 'wahapedia']) {
    if (!revisions[name]) throw new Error(`catalogue snapshot has no ${name} revision`)
  }
  for (const name of ['definitions', 'points', 'rules', 'datacards']) {
    if (!filesUnder(path.join(directory, name)).length) throw new Error(`catalogue snapshot has no ${name} files`)
  }
  if (!filesUnder(path.join(directory, 'battlemaster', 'layouts')).length) throw new Error('catalogue snapshot has no terrain layouts')
  if (!filesUnder(path.join(directory, 'wahapedia')).length) throw new Error('catalogue snapshot has no description exports')
  return revisions
}

function manifestBytes(directory: string) {
  const revisions = requireComplete(directory)
  const files = Object.fromEntries(
    filesUnder(directory)
      .filter((name) => name !== '.snapshot.json')
      .map((name) => [name, sha256(fs.readFileSync(path.join(directory, name)))]),
  )
  return new TextEncoder().encode(`${JSON.stringify({ format: FORMAT, revisions, files } satisfies SnapshotManifest, null, 2)}\n`)
}

export function packCatalogueSnapshot(directory: string, archiveFile: string, pointerFile: string) {
  const manifest = manifestBytes(directory)
  const id = sha256(manifest)
  const parsed = JSON.parse(new TextDecoder().decode(manifest)) as SnapshotManifest
  const entries: Zippable = { 'manifest.json': manifest }
  for (const name of Object.keys(parsed.files)) entries[`catalogue/${name}`] = fs.readFileSync(path.join(directory, name))
  const archive = zipSync(entries, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') })
  const pointer: SnapshotPointer = { format: POINTER_FORMAT, id, archiveSha256: sha256(archive) }
  fs.writeFileSync(archiveFile, archive)
  fs.writeFileSync(pointerFile, `${JSON.stringify(pointer, null, 2)}\n`)
  return pointer
}

function parsePointer(value: unknown): SnapshotPointer {
  const pointer = value as Partial<SnapshotPointer>
  if (pointer?.format !== POINTER_FORMAT || !pointer.id?.match(/^[0-9a-f]{64}$/) || !pointer.archiveSha256?.match(/^[0-9a-f]{64}$/)) {
    throw new Error('catalogue snapshot pointer is invalid')
  }
  return pointer as SnapshotPointer
}

function installArchive(directory: string, archive: Uint8Array, expected: SnapshotPointer) {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('catalogue snapshot archive is too large')
  if (sha256(archive) !== expected.archiveSha256) throw new Error('catalogue snapshot archive checksum does not match')
  const entries = unzipSync(archive)
  const rawManifest = entries['manifest.json']
  if (!rawManifest || sha256(rawManifest) !== expected.id) throw new Error('catalogue snapshot manifest does not match its id')
  const manifest = JSON.parse(new TextDecoder().decode(rawManifest)) as SnapshotManifest
  if (manifest.format !== FORMAT) throw new Error('catalogue snapshot format is unsupported')
  let extracted = 0
  for (const [name, hash] of Object.entries(manifest.files)) {
    const bytes = entries[`catalogue/${name}`]
    extracted += bytes?.length ?? 0
    if (!bytes || sha256(bytes) !== hash) throw new Error(`catalogue snapshot has an invalid ${name}`)
  }
  if (extracted > MAX_EXTRACTED_BYTES) throw new Error('catalogue snapshot expands beyond its size limit')
  const archived = Object.keys(entries)
    .filter((name) => name.startsWith('catalogue/') && !name.endsWith('/'))
    .map((name) => name.slice('catalogue/'.length))
  if (archived.some((name) => !(name in manifest.files))) throw new Error('catalogue snapshot contains an unlisted file')

  const staging = `${directory}.incoming`
  fs.rmSync(staging, { recursive: true, force: true })
  for (const name of Object.keys(manifest.files)) {
    const target = path.resolve(staging, name)
    if (!target.startsWith(`${path.resolve(staging)}${path.sep}`)) throw new Error(`unsafe catalogue snapshot path ${name}`)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, entries[`catalogue/${name}`])
  }
  requireComplete(staging)
  fs.writeFileSync(path.join(staging, '.snapshot.json'), `${JSON.stringify(expected, null, 2)}\n`)
  fs.rmSync(directory, { recursive: true, force: true })
  fs.renameSync(staging, directory)
}

export function installedSnapshot(directory: string): SnapshotPointer | null {
  try {
    requireComplete(directory)
    return parsePointer(JSON.parse(fs.readFileSync(path.join(directory, '.snapshot.json'), 'utf8')))
  } catch {
    return null
  }
}

export async function fetchCurrentSnapshot(directory: string, baseUrl: string, report: (message: string) => void = () => {}) {
  const base = baseUrl.replace(/\/$/, '')
  const pointerResponse = await fetch(`${base}/current.json`, { cache: 'no-store' })
  if (!pointerResponse.ok) throw new Error(`catalogue snapshot pointer answered ${pointerResponse.status}`)
  const pointer = parsePointer(await pointerResponse.json())
  if (installedSnapshot(directory)?.id === pointer.id) {
    report('catalogue is already at the current snapshot')
    return false
  }
  report(`fetching catalogue snapshot ${pointer.id.slice(0, 10)}`)
  const response = await fetch(`${base}/snapshots/${pointer.id}.zip`)
  if (!response.ok) throw new Error(`catalogue snapshot answered ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_ARCHIVE_BYTES) throw new Error('catalogue snapshot archive is too large')
  installArchive(directory, new Uint8Array(await response.arrayBuffer()), pointer)
  report('catalogue snapshot is ready')
  return true
}

export function verifySnapshotArchive(archiveFile: string, pointerFile: string) {
  const temporary = `${archiveFile}.verified`
  installArchive(temporary, fs.readFileSync(archiveFile), parsePointer(JSON.parse(fs.readFileSync(pointerFile, 'utf8'))))
  fs.rmSync(temporary, { recursive: true, force: true })
}
