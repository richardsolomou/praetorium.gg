import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { zipSync, gzipSync, type Zippable } from 'fflate'
import rawLock from '../../catalogue.json' with { type: 'json' }
import rawRevocations from '../../catalogue/revocations.json' with { type: 'json' }
import {
  catalogueSources,
  disabledCatalogueSources,
  isSnapshotSourceName,
  SNAPSHOT_SOURCE_NAMES,
  type SnapshotSourceName,
} from './catalogueSources'
import { CANONICAL_CATALOGUE_SOURCE_NAMES } from './canonicalCatalogueSources'
import pRetry from 'p-retry'
import { fetchWithRetry } from './fetch'
import { publicAssetsBaseUrl } from './objectStorage'
import { readCatalogueComposition } from './catalogueComposition'
import { extractCatalogueArchive, hashCatalogueFile, downloadCatalogueObject } from './catalogueArchive'
import { fetchCatalogueArtifact, catalogueReleaseUrl } from './catalogueDistribution'

const LEGACY_FORMAT = 'praetorium.catalogue.v1'
const COMPLETE_FORMAT = 'praetorium.catalogue.v2'
const SOURCE_FORMAT = 'praetorium.catalogue.v3'
const FORMAT = 'praetorium.catalogue.v4'
const POINTER_FORMAT = 'praetorium.catalogue-pointer.v1'
const LOCK_FORMAT = 'praetorium.catalogue-lock.v1'
const REVOCATIONS_FORMAT = 'praetorium.catalogue-revocations.v1'
const PROVENANCE_FORMAT = 'praetorium.catalogue-provenance.v1'
export const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024
const MAX_EXTRACTED_BYTES = 1024 * 1024 * 1024

type SnapshotManifest = {
  format: typeof FORMAT | typeof SOURCE_FORMAT | typeof COMPLETE_FORMAT | typeof LEGACY_FORMAT
  revisions: Record<string, string>
  sources?: SnapshotSourceName[]
  authoringRevision?: string
  files: Record<string, string>
}

export type SnapshotPointer = {
  format: typeof POINTER_FORMAT
  id: string
  archiveSha256: string
  objects?: true
  authoringRevision?: string
  runtime?: { fingerprint: string; archiveSha256: string }
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
  if (pointer.runtime && (!/^[a-f0-9]{64}$/.test(pointer.runtime.fingerprint) || !/^[a-f0-9]{64}$/.test(pointer.runtime.archiveSha256)))
    throw new Error('catalogue runtime pointer is invalid')
  if (pointer.authoringRevision && !/^[a-f0-9]{40}$/.test(pointer.authoringRevision))
    throw new Error('catalogue authoring revision is invalid')
  return {
    format: POINTER_FORMAT,
    id: pointer.id,
    archiveSha256: pointer.archiveSha256,
    ...(pointer.objects === true ? { objects: true as const } : {}),
    ...(pointer.authoringRevision ? { authoringRevision: pointer.authoringRevision } : {}),
    ...(pointer.runtime ? { runtime: pointer.runtime } : {}),
  }
}

/** `historical` reads a published snapshot as history, passing over a source this code no longer has. */
function revisionsOf(value: unknown, historical = false): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('catalogue revisions are invalid')
  const revisions: Record<string, string> = {}
  for (const [name, revision] of Object.entries(value)) {
    const known = isSnapshotSourceName(name)
    if (historical && !known) continue
    if (!known || typeof revision !== 'string' || !revision) {
      throw new Error(`catalogue revision ${name} is invalid`)
    }
    revisions[name] = revision
  }
  return revisions
}

export function parseCatalogueLock(value: unknown): CatalogueLock {
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

export const catalogueLock = parseCatalogueLock(rawLock)
export const catalogueRevocations = parseRevocations(rawRevocations)

export function catalogueBaseUrl(value = process.env.CATALOGUE_BASE_URL) {
  return (value?.trim() || `${publicAssetsBaseUrl()}/catalogue`).replace(/\/$/, '')
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
export function distributableCatalogueFile(name: string): boolean {
  const editionFile = /^editions\/[a-z0-9-]+\/(.+)$/.exec(name)?.[1]
  if (editionFile) return editionFile === 'revision.json' || distributableCatalogueFile(editionFile)
  if (name === 'revision.json' || name === 'provenance.json' || name === '.snapshot.json' || name === '.snapshot-manifest.json')
    return false
  if (name.startsWith('definitions/')) return /^definitions\/[^/]+\.json$/.test(name)
  if (name.startsWith('rules/')) return false
  if (name.startsWith('datacards/11th/gdc/combatpatrol/') || name.startsWith('datacards/11th/gdc/layouts/')) return false
  if (name.startsWith('datacards/11th/gdc/')) {
    const relative = name.slice('datacards/11th/gdc/'.length)
    return /^[^/]+\.json$/.test(relative) || /^core\/[^/]+\.json$/.test(relative) || /^missions\/[^/]+\.json$/.test(relative)
  }
  return true
}

function provenance(
  revisions: Record<string, string>,
  sources: readonly (typeof SNAPSHOT_SOURCE_NAMES)[number][],
  configuration = catalogueSources,
) {
  return {
    format: PROVENANCE_FORMAT,
    policySha256: sha256(encoded(rawRevocations)),
    modifications:
      'Praetorium selects the source paths its product and verification checks consume, packages the materialized sources including any pinned corrections, and compiles a canonical catalogue with field provenance.',
    sources: sources.map((name) => {
      const source = configuration[name]
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
  const unique = new Map<string, Uint8Array>()
  let size = 0
  for (const name of filesUnder(directory).filter(distributableCatalogueFile)) {
    const source = name.split('/')[0] ?? ''
    if ((SNAPSHOT_SOURCE_NAMES as readonly string[]).includes(source) && disabled.has(source as SnapshotSourceName)) continue
    if (name.startsWith('canonical/') && CANONICAL_CATALOGUE_SOURCE_NAMES.some((dependency) => disabled.has(dependency))) {
      continue
    }
    if (name.startsWith('editions/') && SNAPSHOT_SOURCE_NAMES.some((dependency) => disabled.has(dependency)))
      throw new Error('cannot publish editions with disabled snapshot sources')
    const file = path.join(directory, name)
    size += fs.statSync(file).size
    if (size > MAX_EXTRACTED_BYTES) throw new Error('catalogue snapshot expands beyond its size limit')
    const content = fs.readFileSync(file)
    const digest = sha256(content)
    if (!unique.has(digest)) unique.set(digest, content)
    bytes.set(name, unique.get(digest)!)
  }
  bytes.set('revision.json', encoded(revisions))
  const composition = readCatalogueComposition(directory)
  bytes.set('provenance.json', encoded({ ...provenance(revisions, included, composition?.baseSources), composition }))
  const files = Object.fromEntries([...bytes].map(([name, contents]) => [name, sha256(contents)]))
  const manifest: SnapshotManifest = { format: FORMAT, revisions, sources: included, files }
  return { manifest: encoded(manifest), bytes, files }
}

export function packCatalogueSnapshot(
  directory: string,
  archiveFile: string,
  pointerFile: string,
  objectsDirectory?: string,
  authoringRevision?: string,
) {
  const packed = packedSnapshot(directory)
  if (authoringRevision) {
    if (!/^[a-f0-9]{40}$/.test(authoringRevision)) throw new Error('catalogue authoring revision is invalid')
    packed.manifest = encoded({ ...JSON.parse(Buffer.from(packed.manifest).toString('utf8')), authoringRevision })
  }
  const id = sha256(packed.manifest)
  const entries: Zippable = { 'manifest.json': packed.manifest }
  for (const [name, bytes] of packed.bytes) entries[`objects/${packed.files[name]}`] = bytes
  const archive = zipSync(entries, { level: 9, mtime: new Date('2000-01-01T00:00:00Z') })
  if (archive.length > MAX_ARCHIVE_BYTES) throw new Error('catalogue snapshot archive is too large')
  const pointer: SnapshotPointer = {
    format: POINTER_FORMAT,
    id,
    archiveSha256: sha256(archive),
    objects: true,
    ...(authoringRevision ? { authoringRevision } : {}),
  }
  if (objectsDirectory) {
    fs.mkdirSync(objectsDirectory, { recursive: true })
    fs.writeFileSync(path.join(objectsDirectory, 'manifest.json'), packed.manifest)
    for (const [name, content] of Object.entries(entries)) {
      if (name.startsWith('objects/'))
        fs.writeFileSync(path.join(objectsDirectory, `${name.slice(8)}.gz`), gzipSync(content as Uint8Array, { level: 9, mtime: 0 }))
    }
  }
  fs.writeFileSync(archiveFile, archive)
  fs.writeFileSync(pointerFile, encoded(pointer))
  return pointer
}

function manifestSources(manifest: SnapshotManifest): SnapshotSourceName[] {
  if (manifest.format === LEGACY_FORMAT) return ['definitions', 'points', 'battlemaster', 'rules']
  if (manifest.format === COMPLETE_FORMAT) return ['definitions', 'points', 'datacards', 'battlemaster', 'rules']
  if (!Array.isArray(manifest.sources)) throw new Error('catalogue snapshot has no source inventory')
  for (const name of manifest.sources) {
    if (!isSnapshotSourceName(name)) throw new Error(`catalogue snapshot has an invalid source ${String(name)}`)
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

function assertReplaceableDirectory(directory: string) {
  const resolved = path.resolve(directory)
  if (resolved === path.parse(resolved).root || resolved === path.resolve(os.homedir())) {
    throw new Error(`refusing to replace unsafe catalogue directory ${resolved}`)
  }
}

const objectCache = (directory: string) => path.join(path.dirname(path.resolve(directory)), '.catalogue-objects')

function assertManifestAuthoring(manifest: SnapshotManifest, pointer: SnapshotPointer) {
  if (manifest.authoringRevision && manifest.authoringRevision !== pointer.authoringRevision)
    throw new Error('catalogue authoring revision does not match its manifest')
}

function installManifestFiles(
  directory: string,
  rawManifest: Uint8Array,
  entries: Map<string, { sha256: string; bytes: number; file: string }>,
  expected: SnapshotPointer,
  revocations: CatalogueRevocations,
  expectedRevisions?: Record<string, string>,
) {
  assertReplaceableDirectory(directory)
  if (fs.lstatSync(directory, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new Error('refusing to replace an activated snapshot symlink')
  if (sha256(rawManifest) !== expected.id) throw new Error('catalogue snapshot manifest does not match its id')
  const manifest = JSON.parse(Buffer.from(rawManifest).toString('utf8')) as SnapshotManifest
  assertManifestAuthoring(manifest, expected)
  if (![FORMAT, SOURCE_FORMAT, COMPLETE_FORMAT, LEGACY_FORMAT].includes(manifest.format))
    throw new Error('catalogue snapshot format is unsupported')
  if (!manifest.files || Object.keys(manifest.files).length > 10_000) throw new Error('catalogue snapshot has an invalid file inventory')
  revisionsOf(manifest.revisions)
  assertAllowed(expected, manifestSources(manifest), revocations)
  for (const [name, revision] of Object.entries(expectedRevisions ?? {})) {
    if (manifest.revisions[name] !== revision) throw new Error(`catalogue snapshot does not match the locked ${name} revision`)
  }
  const staging = `${directory}.incoming-${process.pid}-${randomUUID()}`
  try {
    const used = new Set(['manifest.json'])
    const sharedFiles = new Map<string, string>()
    let size = 0
    fs.mkdirSync(staging, { recursive: true })
    for (const [name, hash] of Object.entries(manifest.files)) {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('catalogue snapshot has an invalid file hash')
      if (
        path.isAbsolute(name) ||
        name.includes('\\') ||
        name.split('/').some((part) => !part || part === '.' || part === '..') ||
        name.startsWith('.snapshot')
      ) {
        throw new Error(`unsafe catalogue snapshot path ${name}`)
      }
      const key = manifest.format === FORMAT ? `objects/${hash}` : `catalogue/${name}`
      const entry = entries.get(key)
      if (!entry || entry.sha256 !== hash) throw new Error(`catalogue snapshot has an invalid ${name}`)
      size += entry.bytes
      if (size > MAX_EXTRACTED_BYTES) throw new Error('catalogue snapshot expands beyond its size limit')
      used.add(key)
      const target = path.join(staging, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const input = sharedFiles.get(hash) ?? entry.file
      try {
        fs.linkSync(input, target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
        fs.copyFileSync(input, target)
      }
      sharedFiles.set(hash, target)
    }
    if ([...entries.keys()].some((name) => !used.has(name))) throw new Error('catalogue snapshot contains an unlisted file')
    fs.writeFileSync(path.join(staging, '.snapshot.json'), encoded(expected))
    fs.writeFileSync(path.join(staging, '.snapshot-manifest.json'), rawManifest)
    if (manifest.format === FORMAT) {
      fs.mkdirSync(objectCache(directory), { recursive: true })
      for (const [key, entry] of entries) {
        if (!key.startsWith('objects/')) continue
        const cached = path.join(objectCache(directory), key.slice(8))
        if (!fs.existsSync(cached)) {
          try {
            fs.linkSync(entry.file, cached)
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === 'EXDEV') {
              const temporary = `${cached}.${randomUUID()}`
              try {
                fs.copyFileSync(entry.file, temporary)
                fs.renameSync(temporary, cached)
              } finally {
                fs.rmSync(temporary, { force: true })
              }
            } else if (code !== 'EEXIST') throw error
          }
        }
      }
    }
    const previous = `${directory}.previous-${randomUUID()}`
    if (installedSnapshotDetails(directory)?.pointer.id === expected.id) {
      verifyInstalledSnapshot(directory)
      return
    }
    if (fs.existsSync(directory)) fs.renameSync(directory, previous)
    try {
      fs.renameSync(staging, directory)
    } catch (error) {
      if (installedSnapshotDetails(directory)?.pointer.id === expected.id) {
        verifyInstalledSnapshot(directory)
        return
      }
      if (fs.existsSync(previous)) fs.renameSync(previous, directory)
      throw error
    }
    fs.rmSync(previous, { recursive: true, force: true })
  } finally {
    fs.rmSync(staging, { recursive: true, force: true })
  }
}

function installArchive(
  directory: string,
  archive: string,
  expected: SnapshotPointer,
  revocations = catalogueRevocations,
  expectedRevisions?: Record<string, string>,
) {
  const extracted = `${directory}.zip-${randomUUID()}`
  try {
    const result = extractCatalogueArchive(archive, extracted)
    if (result.sha256 !== expected.archiveSha256) throw new Error('catalogue snapshot archive checksum does not match')
    installManifestFiles(
      directory,
      fs.readFileSync(result.files.get('manifest.json')!.file),
      result.files,
      expected,
      revocations,
      expectedRevisions,
    )
  } finally {
    fs.rmSync(extracted, { recursive: true, force: true })
  }
}

class CatalogueObjectTransportError extends Error {}

async function fetchSnapshotObjects(
  directory: string,
  baseUrl: string,
  pointer: SnapshotPointer,
  revocations: CatalogueRevocations,
  revisions?: Record<string, string>,
) {
  const base = baseUrl.replace(/\/$/, '')
  const request = async (url: string) => {
    try {
      const response = await fetchWithRetry(url)
      if (!response.ok) throw new CatalogueObjectTransportError(`catalogue object answered ${response.status}`)
      return response
    } catch (error) {
      throw new CatalogueObjectTransportError('catalogue object transport failed', { cause: error })
    }
  }
  const response = await request(`${base}/manifests/${pointer.id}.json`)
  const manifestFile = path.join(objectCache(directory), `manifest-${pointer.id}-${randomUUID()}`)
  try {
    await saveResponse(response, manifestFile, 1024 * 1024)
    const raw = fs.readFileSync(manifestFile)
    if (sha256(raw) !== pointer.id) throw new Error('catalogue snapshot manifest does not match its id')
    const manifest = JSON.parse(raw.toString('utf8')) as SnapshotManifest
    if (manifest.format !== FORMAT || !manifest.files || Object.keys(manifest.files).length > 10_000)
      throw new Error('catalogue object manifest is invalid')
    assertAllowed(pointer, manifestSources(manifest), revocations)
    for (const [name, revision] of Object.entries(revisions ?? {})) {
      if (manifest.revisions[name] !== revision) throw new Error(`catalogue snapshot does not match the locked ${name} revision`)
    }
    const hashes = [...new Set(Object.values(manifest.files))]
    if (hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))) throw new Error('catalogue object hash is invalid')
    const entries = new Map<string, { sha256: string; bytes: number; file: string }>()
    let cursor = 0
    let total = 0
    const workers = Array.from({ length: Math.min(8, hashes.length) }, async () => {
      while (cursor < hashes.length) {
        const hash = hashes[cursor++]!
        const file = path.join(objectCache(directory), hash)
        if (!fs.existsSync(file) || fs.statSync(file).size > 64 * 1024 * 1024 || hashCatalogueFile(file) !== hash) {
          const temporary = `${file}.${randomUUID()}`
          try {
            await downloadCatalogueObject(await request(`${base}/objects/${hash}.gz`), temporary, hash)
            fs.renameSync(temporary, file)
          } finally {
            fs.rmSync(temporary, { force: true })
          }
        }
        const bytes = fs.statSync(file).size
        total += bytes
        if (bytes > 64 * 1024 * 1024 || total > MAX_EXTRACTED_BYTES) throw new Error('catalogue objects exceed their size limit')
        entries.set(`objects/${hash}`, { sha256: hash, bytes, file })
      }
    })
    const settled = await Promise.allSettled(workers)
    const failure = settled.find((result) => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    installManifestFiles(directory, raw, entries, pointer, revocations, revisions)
  } finally {
    fs.rmSync(manifestFile, { force: true })
  }
}

function installedSnapshotDetails(directory: string, historical = false): InstalledSnapshot | null {
  try {
    const pointer = parsePointer(JSON.parse(fs.readFileSync(path.join(directory, '.snapshot.json'), 'utf8')))
    const revisions = revisionsOf(JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')), historical)
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

export function verifyInstalledSnapshot(directory: string): SnapshotPointer {
  const pointer = parsePointer(JSON.parse(fs.readFileSync(path.join(directory, '.snapshot.json'), 'utf8')))
  const rawManifest = fs.readFileSync(path.join(directory, '.snapshot-manifest.json'))
  if (sha256(rawManifest) !== pointer.id) throw new Error('catalogue snapshot manifest does not match its id')
  const manifest = JSON.parse(Buffer.from(rawManifest).toString('utf8')) as SnapshotManifest
  assertManifestAuthoring(manifest, pointer)
  if (![FORMAT, SOURCE_FORMAT, COMPLETE_FORMAT, LEGACY_FORMAT].includes(manifest.format))
    throw new Error('catalogue snapshot format is unsupported')
  const sources = manifestSources(manifest)
  assertAllowed(pointer, sources, configuredRevocations())
  const revisions = revisionsOf(JSON.parse(fs.readFileSync(path.join(directory, 'revision.json'), 'utf8')))
  if (JSON.stringify(revisions) !== JSON.stringify(manifest.revisions)) throw new Error('catalogue revisions do not match the manifest')
  let size = 0
  for (const [name, hash] of Object.entries(manifest.files)) {
    if (path.isAbsolute(name) || name.split('/').includes('..')) throw new Error(`unsafe catalogue snapshot path ${name}`)
    const file = path.join(directory, name)
    if (!fs.statSync(file).isFile()) throw new Error(`catalogue snapshot has an invalid ${name}`)
    const bytes = fs.readFileSync(file)
    size += bytes.length
    if (sha256(bytes) !== hash) throw new Error(`catalogue snapshot has an invalid ${name}`)
  }
  if (size > MAX_EXTRACTED_BYTES) throw new Error('catalogue snapshot expands beyond its size limit')
  const listed = new Set(Object.keys(manifest.files))
  if (filesUnder(directory).some((name) => !name.startsWith('.snapshot') && !listed.has(name))) {
    throw new Error('catalogue snapshot contains an unlisted file')
  }
  return pointer
}

/**
 * The sources an installed snapshot carries, read as history rather than as the data to
 * serve: a revision for a source this code no longer has is passed over, since nothing reads
 * it. An instance never installs this way; `installedSnapshot` refuses such a snapshot.
 */
export function historicalSnapshotSources(directory: string): SnapshotSourceName[] | null {
  return installedSnapshotDetails(directory, true)?.sources ?? null
}

export async function fetchCurrentPointer(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, '')
  const response = await fetchWithRetry(`${base}/current.json`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`catalogue snapshot pointer answered ${response.status}`)
  return parsePointer(await response.json())
}

export async function fetchReleasePointer(baseUrl: string, id: string) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('catalogue release id is invalid')
  const response = await fetchCatalogueArtifact(
    `${baseUrl.replace(/\/$/, '')}/releases/${id}.json`,
    catalogueReleaseUrl(id, 'release.json'),
  )
  if (!response.ok) throw new Error(`catalogue release pointer answered ${response.status}`)
  const pointer = parsePointer(await response.json())
  if (pointer.id !== id) throw new Error('catalogue release pointer does not match its id')
  return pointer
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
  if (pointer.objects && fs.existsSync(objectCache(directory))) {
    try {
      await fetchSnapshotObjects(directory, baseUrl, pointer, options.revocations ?? configuredRevocations(), options.revisions)
      report('catalogue snapshot is ready from shared objects')
      return true
    } catch (error) {
      if (!(error instanceof CatalogueObjectTransportError)) throw error
    }
  }
  report(`fetching catalogue snapshot ${pointer.id.slice(0, 10)}`)
  const archive = `${directory}.download-${randomUUID()}`
  await saveSnapshotArchive(baseUrl, pointer, archive)
  try {
    installArchive(directory, archive, pointer, options.revocations ?? configuredRevocations(), options.revisions)
  } finally {
    fs.rmSync(archive, { force: true })
  }
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
  installArchive(directory, archiveFile, pointer, configuredRevocations(), revisions ?? undefined)
}

export async function downloadSnapshotArchive(
  archiveFile: string,
  baseUrl: string,
  pointer = catalogueLock.pointer,
  revisions: Record<string, string> | undefined = catalogueLock.revisions,
) {
  const temporary = `${archiveFile}.${randomUUID()}`
  try {
    await saveSnapshotArchive(baseUrl, pointer, temporary)
    verifyArchiveFile(temporary, pointer, revisions)
    fs.renameSync(temporary, archiveFile)
  } finally {
    fs.rmSync(temporary, { force: true })
  }
}

export function verifySnapshotArchive(archiveFile: string, pointerFile: string) {
  const pointer = parsePointer(JSON.parse(fs.readFileSync(pointerFile, 'utf8')))
  verifyArchiveFile(archiveFile, pointer)
  return pointer
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

/** Downloads a snapshot archive, starting again when the connection drops mid-body, which `fetchWithRetry` cannot see. */
async function saveSnapshotArchive(baseUrl: string, pointer: SnapshotPointer, file: string) {
  await pRetry(
    async () => {
      const response = await fetchCatalogueArtifact(
        `${baseUrl.replace(/\/$/, '')}/snapshots/${pointer.id}.zip`,
        catalogueReleaseUrl(pointer.id, 'snapshot.zip'),
      )
      if (!response.ok) throw new Error(`catalogue snapshot answered ${response.status}`)
      if (Number(response.headers.get('content-length') ?? 0) > MAX_ARCHIVE_BYTES)
        throw new Error('catalogue snapshot archive is too large')
      await saveResponse(response, file)
    },
    { retries: 2, minTimeout: 1_000, shouldRetry: ({ error }) => error instanceof TypeError },
  )
}

async function saveResponse(response: Response, file: string, limit = MAX_ARCHIVE_BYTES) {
  if (!response.body) throw new Error('catalogue snapshot response has no body')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const fd = fs.openSync(file, 'wx')
  const reader = response.body.getReader()
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.length
      if (bytes > limit) throw new Error('catalogue snapshot archive is too large')
      fs.writeFileSync(fd, chunk.value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    fs.rmSync(file, { force: true })
    throw error
  } finally {
    fs.closeSync(fd)
    reader.releaseLock()
  }
}

function verifyArchiveFile(archive: string, pointer: SnapshotPointer, revisions?: Record<string, string>) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'catalogue-verify-'))
  try {
    installArchive(path.join(work, 'snapshot'), archive, pointer, configuredRevocations(), revisions)
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

export function readSnapshotPointer(file: string) {
  return parsePointer(JSON.parse(fs.readFileSync(file, 'utf8')))
}
