import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { unzipSync, zipSync, type Zippable } from 'fflate'
import rawLock from '../../catalogue/lock.json' with { type: 'json' }
import rawRevocations from '../../catalogue/revocations.json' with { type: 'json' }
import {
  catalogueSources,
  disabledCatalogueSources,
  isSnapshotSourceName,
  SNAPSHOT_SOURCE_NAMES,
  type SnapshotSourceName,
} from './catalogueSources'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from './canonicalCatalogueSources'
import { fetchWithRetry } from './fetch'
import { DEFAULT_S3_PUBLIC_BASE_URL } from './objectStorage'

const LEGACY_FORMAT = 'praetorium.catalogue.v1'
const COMPLETE_FORMAT = 'praetorium.catalogue.v2'
const FORMAT = 'praetorium.catalogue.v3'
const POINTER_FORMAT = 'praetorium.catalogue-pointer.v1'
const LOCK_FORMAT = 'praetorium.catalogue-lock.v1'
const REVOCATIONS_FORMAT = 'praetorium.catalogue-revocations.v1'
const PROVENANCE_FORMAT = 'praetorium.catalogue-provenance.v1'
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024

type SnapshotManifest = {
  format: typeof FORMAT | typeof COMPLETE_FORMAT | typeof LEGACY_FORMAT
  revisions: Record<string, string>
  sources?: SnapshotSourceName[]
  files: Record<string, string>
}

export type SnapshotPointer = {
  format: typeof POINTER_FORMAT
  id: string
  archiveSha256: string
}

export type CatalogueLock = {
  format: typeof LOCK_FORMAT
  pointer: SnapshotPointer
  revisions: Record<string, string>
}

export type CatalogueRevocations = {
  format: typeof REVOCATIONS_FORMAT
  snapshots: string[]
  sources: SnapshotSourceName[]
}

type InstalledSnapshot = {
  pointer: SnapshotPointer
  revisions: Record<string, string>
  sources: SnapshotSourceName[]
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const encoded = (value: unknown) => new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)

function filesUnder(directory: string, relative = ''): string[] {
  if (!fs.existsSync(path.join(directory, relative))) return []
  return fs
    .readdirSync(path.join(directory, relative), { withFileTypes: true })
    .flatMap((entry) => {
      const name = path.posix.join(relative, entry.name)
      return entry.isDirectory() ? filesUnder(directory, name) : [name]
    })
    .toSorted()
}

function parsePointer(value: unknown): SnapshotPointer {
  const pointer = value as Partial<SnapshotPointer>
  if (pointer?.format !== POINTER_FORMAT || !pointer.id?.match(/^[0-9a-f]{64}$/) || !pointer.archiveSha256?.match(/^[0-9a-f]{64}$/)) {
    throw new Error('catalogue snapshot pointer is invalid')
  }
  return pointer as SnapshotPointer
}

function revisionsOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('catalogue revisions are invalid')
  const revisions: Record<string, string> = {}
  for (const [name, revision] of Object.entries(value)) {
    if (!(SNAPSHOT_SOURCE_NAMES as readonly string[]).includes(name) || typeof revision !== 'string' || !revision) {
      throw new Error(`catalogue revision ${name} is invalid`)
    }
    revisions[name] = revision
  }
  return revisions
}

function parseLock(value: unknown): CatalogueLock {
  if (!value || typeof value !== 'object') throw new Error('catalogue lock is invalid')
  const candidate = value as Partial<CatalogueLock>
  if (candidate.format !== LOCK_FORMAT) throw new Error('catalogue lock format is unsupported')
  const revisions = revisionsOf(candidate.revisions)
  return { format: LOCK_FORMAT, pointer: parsePointer(candidate.pointer), revisions }
}

function parseRevocations(value: unknown): CatalogueRevocations {
  if (!value || typeof value !== 'object') throw new Error('catalogue revocations are invalid')
  const candidate = value as Partial<CatalogueRevocations>
  if (candidate.format !== REVOCATIONS_FORMAT || !Array.isArray(candidate.snapshots) || !Array.isArray(candidate.sources)) {
    throw new Error('catalogue revocations are invalid')
  }
  const snapshots = candidate.snapshots.map((id) => {
    if (typeof id !== 'string' || !id.match(/^[0-9a-f]{64}$/)) throw new Error('catalogue revocations contain an invalid snapshot')
    return id
  })
  const sources = candidate.sources.map((name) => {
    if (typeof name !== 'string' || !isSnapshotSourceName(name)) {
      throw new Error('catalogue revocations contain an invalid source')
    }
    return name
  })
  return { format: REVOCATIONS_FORMAT, snapshots, sources }
}

export const catalogueLock = parseLock(rawLock)
export const catalogueRevocations = parseRevocations(rawRevocations)

export function catalogueBaseUrl(value = process.env.CATALOGUE_BASE_URL) {
  return (value?.trim() || DEFAULT_S3_PUBLIC_BASE_URL).replace(/\/$/, '')
}

function configuredRevocations() {
  return mergeRevocations(catalogueRevocations, {
    format: REVOCATIONS_FORMAT,
    snapshots: [],
    sources: [...disabledCatalogueSources()],
  })
}

function sourceDirectoryComplete(directory: string, name: SnapshotSourceName) {
  if (name === 'battlemaster') return filesUnder(path.join(directory, name, 'layouts')).length > 0
  return filesUnder(path.join(directory, name)).length > 0
}

function includedSources(directory: string, disabled: ReadonlySet<SnapshotSourceName>) {
  const revisions = revisionsOf(JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')))
  const included = SNAPSHOT_SOURCE_NAMES.filter((name) => !disabled.has(name))
  for (const name of included) {
    if (!revisions[name]) throw new Error(`catalogue snapshot has no ${name} revision`)
    if (!sourceDirectoryComplete(directory, name)) throw new Error(`catalogue snapshot has no ${name} files`)
  }
  return { included, revisions: Object.fromEntries(included.map((name) => [name, revisions[name]!])) }
}

/** Raw source paths that neither the product nor its catalogue checks read. */
export function distributableCatalogueFile(name: string) {
  if (name === 'revision.json' || name === 'provenance.json' || name === '.snapshot.json' || name === '.snapshot-manifest.json')
    return false
  if (name.startsWith('definitions/')) return /^definitions\/[^/]+\.json$/.test(name)
  if (name.startsWith('rules/data/core/_example/') || name.startsWith('rules/data/core/_reports/')) return false
  if (name.startsWith('datacards/11th/gdc/combatpatrol/') || name.startsWith('datacards/11th/gdc/layouts/')) return false
  if (name.startsWith('datacards/11th/gdc/')) {
    const relative = name.slice('datacards/11th/gdc/'.length)
    return /^[^/]+\.json$/.test(relative) || /^core\/[^/]+\.json$/.test(relative) || /^missions\/[^/]+\.json$/.test(relative)
  }
  return true
}

function provenance(revisions: Record<string, string>, sources: readonly SnapshotSourceName[]) {
  return {
    format: PROVENANCE_FORMAT,
    policySha256: sha256(encoded(rawRevocations)),
    modifications:
      'Praetorium selects the source paths its product and verification checks consume, packages them in one archive, and compiles a canonical catalogue with field provenance without changing the archived source text.',
    sources: sources.map((name) => {
      const source = catalogueSources[name]
      return {
        name,
        revision: revisions[name],
        origin: 'repository' in source ? `https://github.com/${source.repository}` : source.baseUrl,
        ...('path' in source && source.path ? { path: source.path } : {}),
        license: source.license,
        ...(source.licenseUrl ? { licenseUrl: source.licenseUrl } : {}),
        ...(source.attribution ? { attribution: source.attribution } : {}),
      }
    }),
  }
}

function packedSnapshot(directory: string, disabled = new Set([...disabledCatalogueSources(), ...catalogueRevocations.sources])) {
  const { included, revisions } = includedSources(directory, disabled)
  const bytes = new Map<string, Uint8Array>()
  for (const name of filesUnder(directory).filter(distributableCatalogueFile)) {
    const source = name.split('/')[0] ?? ''
    if ((SNAPSHOT_SOURCE_NAMES as readonly string[]).includes(source) && disabled.has(source as SnapshotSourceName)) continue
    if (name.startsWith('canonical/') && CANONICAL_CATALOGUE_SOURCE_NAMES.some((dependency) => disabled.has(dependency))) {
      continue
    }
    bytes.set(name, fs.readFileSync(path.join(directory, name)))
  }
  bytes.set('revision.json', encoded(revisions))
  bytes.set('provenance.json', encoded(provenance(revisions, included)))
  const files = Object.fromEntries([...bytes].map(([name, contents]) => [name, sha256(contents)]))
  const manifest: SnapshotManifest = { format: FORMAT, revisions, sources: included, files }
  return { manifest: encoded(manifest), bytes }
}

export function packCatalogueSnapshot(directory: string, archiveFile: string, pointerFile: string) {
  const packed = packedSnapshot(directory)
  const id = sha256(packed.manifest)
  const entries: Zippable = { 'manifest.json': packed.manifest }
  for (const [name, bytes] of packed.bytes) entries[`catalogue/${name}`] = bytes
  const archive = zipSync(entries, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') })
  const pointer: SnapshotPointer = { format: POINTER_FORMAT, id, archiveSha256: sha256(archive) }
  fs.writeFileSync(archiveFile, archive)
  fs.writeFileSync(pointerFile, encoded(pointer))
  return pointer
}

function manifestSources(manifest: SnapshotManifest): SnapshotSourceName[] {
  if (manifest.format === LEGACY_FORMAT) return SNAPSHOT_SOURCE_NAMES.filter((name) => name !== 'datacards')
  if (manifest.format === COMPLETE_FORMAT) return [...SNAPSHOT_SOURCE_NAMES]
  if (!Array.isArray(manifest.sources)) throw new Error('catalogue snapshot has no source inventory')
  for (const name of manifest.sources) {
    if (!(SNAPSHOT_SOURCE_NAMES as readonly string[]).includes(name)) throw new Error(`catalogue snapshot has an invalid source ${name}`)
  }
  return [...new Set(manifest.sources)]
}

function mergeRevocations(left: CatalogueRevocations, right: CatalogueRevocations): CatalogueRevocations {
  return {
    format: REVOCATIONS_FORMAT,
    snapshots: [...new Set([...left.snapshots, ...right.snapshots])],
    sources: [...new Set([...left.sources, ...right.sources])],
  }
}

function assertAllowed(pointer: SnapshotPointer, sources: readonly SnapshotSourceName[], revocations: CatalogueRevocations) {
  if (revocations.snapshots.includes(pointer.id)) throw new Error(`catalogue snapshot ${pointer.id} has been revoked`)
  const revokedSource = sources.find((name) => revocations.sources.includes(name))
  if (revokedSource) throw new Error(`catalogue source ${revokedSource} has been revoked`)
}

function validatedArchive(
  archive: Uint8Array,
  expected: SnapshotPointer,
  revocations: CatalogueRevocations,
  expectedRevisions?: Record<string, string>,
) {
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('catalogue snapshot archive is too large')
  if (sha256(archive) !== expected.archiveSha256) throw new Error('catalogue snapshot archive checksum does not match')
  const entries = unzipSync(archive)
  const rawManifest = entries['manifest.json']
  if (!rawManifest || sha256(rawManifest) !== expected.id) throw new Error('catalogue snapshot manifest does not match its id')
  const manifest = JSON.parse(new TextDecoder().decode(rawManifest)) as SnapshotManifest
  if (![FORMAT, COMPLETE_FORMAT, LEGACY_FORMAT].includes(manifest.format)) throw new Error('catalogue snapshot format is unsupported')
  const sources = manifestSources(manifest)
  assertAllowed(expected, sources, revocations)
  if (expectedRevisions) {
    for (const [name, revision] of Object.entries(expectedRevisions)) {
      if (manifest.revisions[name] !== revision) throw new Error(`catalogue snapshot does not match the locked ${name} revision`)
    }
  }
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
  return { entries, manifest, rawManifest, sources }
}

function assertReplaceableDirectory(directory: string) {
  const resolved = path.resolve(directory)
  if (resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir())) {
    throw new Error(`refusing to replace unsafe catalogue directory ${resolved}`)
  }
}

function installArchive(
  directory: string,
  archive: Uint8Array,
  expected: SnapshotPointer,
  revocations = catalogueRevocations,
  expectedRevisions?: Record<string, string>,
) {
  assertReplaceableDirectory(directory)
  const validated = validatedArchive(archive, expected, revocations, expectedRevisions)
  const staging = `${directory}.incoming-${process.pid}-${randomUUID()}`
  try {
    for (const name of Object.keys(validated.manifest.files)) {
      const target = path.resolve(staging, name)
      if (!target.startsWith(`${path.resolve(staging)}${path.sep}`)) throw new Error(`unsafe catalogue snapshot path ${name}`)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, validated.entries[`catalogue/${name}`]!)
    }
    fs.writeFileSync(path.join(staging, '.snapshot.json'), encoded(expected))
    fs.writeFileSync(path.join(staging, '.snapshot-manifest.json'), validated.rawManifest)
    fs.rmSync(directory, { recursive: true, force: true })
    fs.renameSync(staging, directory)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

function installedSnapshotDetails(directory: string): InstalledSnapshot | null {
  try {
    const pointer = parsePointer(JSON.parse(fs.readFileSync(path.join(directory, '.snapshot.json'), 'utf8')))
    const revisions = revisionsOf(JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')))
    const manifestFile = path.join(directory, '.snapshot-manifest.json')
    const sources = fs.existsSync(manifestFile)
      ? manifestSources(JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as SnapshotManifest)
      : [...SNAPSHOT_SOURCE_NAMES]
    for (const name of sources) if (!sourceDirectoryComplete(directory, name)) throw new Error(`catalogue snapshot has no ${name} files`)
    return { pointer, revisions, sources }
  } catch {
    return null
  }
}

export function installedSnapshot(directory: string): SnapshotPointer | null {
  return installedSnapshotDetails(directory)?.pointer ?? null
}

/** The sources an installed snapshot says it carries, or null when it is not a complete install. */
export function installedSnapshotSources(directory: string): SnapshotSourceName[] | null {
  return installedSnapshotDetails(directory)?.sources ?? null
}

export async function fetchCurrentPointer(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '')
  const response = await fetchWithRetry(`${base}/current.json`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`catalogue snapshot pointer answered ${response.status}`)
  return parsePointer(await response.json())
}

export async function remoteRevocations(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '')
  const response = await fetchWithRetry(`${base}/revocations.json`, { cache: 'no-store' })
  if (response.status === 404) return configuredRevocations()
  if (!response.ok) throw new Error(`catalogue revocations answered ${response.status}`)
  return mergeRevocations(configuredRevocations(), parseRevocations(await response.json()))
}

export async function fetchSnapshot(
  directory: string,
  baseUrl: string,
  pointer: SnapshotPointer,
  report: (message: string) => void = () => {},
  options: { revocations?: CatalogueRevocations; revisions?: Record<string, string> } = {},
) {
  const current = installedSnapshotDetails(directory)
  if (current?.pointer.id === pointer.id) {
    try {
      assertAllowed(pointer, current.sources, options.revocations ?? configuredRevocations())
      if (options.revisions) {
        for (const [name, revision] of Object.entries(options.revisions)) {
          if (current.revisions[name] !== revision) throw new Error(`catalogue snapshot does not match the locked ${name} revision`)
        }
      }
      report('catalogue is already at the requested snapshot')
      return false
    } catch (error) {
      assertReplaceableDirectory(directory)
      fs.rmSync(directory, { recursive: true, force: true })
      throw error
    }
  }
  report(`fetching catalogue snapshot ${pointer.id.slice(0, 10)}`)
  const response = await fetchWithRetry(`${baseUrl.replace(/\/$/, '')}/snapshots/${pointer.id}.zip`)
  if (!response.ok) throw new Error(`catalogue snapshot answered ${response.status}`)
  const length = Number(response.headers.get('content-length') ?? 0)
  if (length > MAX_ARCHIVE_BYTES) throw new Error('catalogue snapshot archive is too large')
  installArchive(
    directory,
    new Uint8Array(await response.arrayBuffer()),
    pointer,
    options.revocations ?? configuredRevocations(),
    options.revisions,
  )
  report('catalogue snapshot is ready')
  return true
}

export async function fetchPinnedSnapshot(directory: string, baseUrl: string, report: (message: string) => void = () => {}) {
  return fetchSnapshot(directory, baseUrl, catalogueLock.pointer, report, {
    revocations: configuredRevocations(),
    revisions: catalogueLock.revisions,
  })
}

export async function fetchCurrentSnapshot(directory: string, baseUrl: string, report: (message: string) => void = () => {}) {
  const revocations = await remoteRevocations(baseUrl)
  const pointer = await fetchCurrentPointer(baseUrl)
  return fetchSnapshot(directory, baseUrl, pointer, report, { revocations })
}

export function installSnapshotArchive(
  directory: string,
  archiveFile: string,
  pointer = catalogueLock.pointer,
  /** Null installs a snapshot whatever revisions it pins, as a historical one does. */
  revisions: Record<string, string> | null = catalogueLock.revisions,
) {
  installArchive(directory, fs.readFileSync(archiveFile), pointer, configuredRevocations(), revisions ?? undefined)
}

export async function downloadSnapshotArchive(
  archiveFile: string,
  baseUrl: string,
  pointer = catalogueLock.pointer,
  revisions: Record<string, string> | undefined = catalogueLock.revisions,
) {
  const response = await fetchWithRetry(`${baseUrl.replace(/\/$/, '')}/snapshots/${pointer.id}.zip`)
  if (!response.ok) throw new Error(`catalogue snapshot answered ${response.status}`)
  const archive = new Uint8Array(await response.arrayBuffer())
  validatedArchive(archive, pointer, configuredRevocations(), revisions)
  fs.writeFileSync(archiveFile, archive)
}

export function verifySnapshotArchive(archiveFile: string, pointerFile: string) {
  const pointer = parsePointer(JSON.parse(fs.readFileSync(pointerFile, 'utf8')))
  validatedArchive(fs.readFileSync(archiveFile), pointer, configuredRevocations())
}

export function activateCachedSnapshot(directory: string, cachedDirectory: string) {
  assertReplaceableDirectory(directory)
  const cached = path.resolve(cachedDirectory)
  if (!installedSnapshot(cached)) throw new Error(`cached catalogue snapshot is incomplete at ${cached}`)
  const staging = `${directory}.link-${process.pid}-${randomUUID()}`
  fs.mkdirSync(path.dirname(path.resolve(directory)), { recursive: true })
  try {
    fs.symlinkSync(cached, staging, process.platform === 'win32' ? 'junction' : 'dir')
    fs.rmSync(directory, { recursive: true, force: true })
    fs.renameSync(staging, directory)
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

export function catalogueUpdateMode(value = process.env.CATALOGUE_UPDATE_MODE): 'latest' | 'pinned' | 'off' {
  const mode = value?.trim() || 'latest'
  if (mode !== 'latest' && mode !== 'pinned' && mode !== 'off') throw new Error('CATALOGUE_UPDATE_MODE must be latest, pinned, or off')
  return mode
}
