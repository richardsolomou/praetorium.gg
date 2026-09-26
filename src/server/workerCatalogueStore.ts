import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { catalogueFromIndex } from './catalogueIndex'
import { decodeCatalogueArtifact } from './catalogueArtifactCodec'
import type { LoadedDatacards } from './datacards'
import type { ExternalReferences } from './externalReferences'
import type { LoadedRules } from './rules'
import type { factionIndexFor } from './factionReferences'
import type { combatUnitsFor } from './combatUnits'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'
import type { factionsFor } from './factionReferences'
import type { GlobalSearchIndex } from './globalSearch'

type Entry = { sha256: string; bytes: number }
type Manifest = {
  format: 'praetorium.worker-catalogue.v1'
  snapshotId: string
  revision: string
  entries: Record<string, Entry>
  partitions: Record<string, string>
}
type Shared = {
  datacards: LoadedDatacards
  sourceReferences: ExternalReferences
  rules: LoadedRules
  factionIndex: ReturnType<typeof factionIndexFor>
  factions: ReturnType<typeof factionsFor>
  combatUnits: ReturnType<typeof combatUnitsFor>
  searchIndex: GlobalSearchIndex
  history: CatalogueHistoryEntry[] | null
}
type Read = (key: string, maxBytes: number) => Promise<ArrayBuffer>

const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_SHARED_BYTES = 20 * 1024 * 1024
const MAX_PARTITION_BYTES = 10 * 1024 * 1024
const HASH = /^[0-9a-f]{64}$/

async function hash(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function manifestOf(value: unknown, snapshotId: string): Manifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker catalogue manifest')
  const manifest = value as Partial<Manifest>
  if (
    manifest.format !== 'praetorium.worker-catalogue.v1' ||
    manifest.snapshotId !== snapshotId ||
    typeof manifest.revision !== 'string' ||
    !manifest.revision ||
    !manifest.entries ||
    !manifest.partitions ||
    Object.keys(manifest.entries).length > 100 ||
    Object.keys(manifest.partitions).length > 100
  ) {
    throw new Error('Invalid Worker catalogue manifest')
  }
  for (const [name, entry] of Object.entries(manifest.entries)) {
    if (
      !/^(?:shared|partitions\/[0-9a-f]{24})\.json$/.test(name) ||
      !entry ||
      !HASH.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > (name === 'shared.json' ? MAX_SHARED_BYTES : MAX_PARTITION_BYTES)
    ) {
      throw new Error('Invalid Worker catalogue entry')
    }
  }
  if (!manifest.entries['shared.json']) throw new Error('Worker catalogue shared data is missing')
  for (const [id, name] of Object.entries(manifest.partitions)) {
    if (!id || id.length > 128 || typeof name !== 'string' || !Object.hasOwn(manifest.entries, name)) {
      throw new Error('Invalid Worker catalogue partition')
    }
  }
  return manifest as Manifest
}

function sharedOf(value: unknown): Shared {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker catalogue shared data')
  const shared = value as Partial<Shared>
  if (
    !(shared.datacards?.factions instanceof Map) ||
    !(shared.sourceReferences?.units?.byCanonicalId instanceof Map) ||
    !(shared.rules?.byDetachment instanceof Map) ||
    !Array.isArray(shared.factionIndex?.factions) ||
    !Array.isArray(shared.factions?.factions) ||
    !Array.isArray(shared.combatUnits) ||
    !Array.isArray(shared.searchIndex?.datasheets) ||
    (shared.history !== null && !Array.isArray(shared.history))
  ) {
    throw new Error('Invalid Worker catalogue shared data')
  }
  return shared as Shared
}

export class WorkerCatalogueStore {
  private manifestPromise?: Promise<Manifest>
  private sharedPromise?: Promise<Shared>

  constructor(
    private readonly read: Read,
    private readonly snapshotId: string,
    private readonly manifestSha256: string,
  ) {
    if (!HASH.test(snapshotId) || !HASH.test(manifestSha256)) throw new Error('Invalid Worker catalogue version')
  }

  private key(name: string) {
    return `snapshots/${this.snapshotId}/${name}`
  }

  private async bytes(name: string, entry: Entry) {
    const bytes = await this.read(this.key(name), entry.bytes)
    if (bytes.byteLength !== entry.bytes || (await hash(bytes)) !== entry.sha256) {
      throw new Error(`Worker catalogue ${name} checksum does not match`)
    }
    return new TextDecoder().decode(bytes)
  }

  private manifest() {
    this.manifestPromise ??= this.read(this.key('manifest.json'), MAX_MANIFEST_BYTES)
      .then(async (bytes) => {
        if (bytes.byteLength > MAX_MANIFEST_BYTES || (await hash(bytes)) !== this.manifestSha256) {
          throw new Error('Worker catalogue manifest checksum does not match')
        }
        return manifestOf(JSON.parse(new TextDecoder().decode(bytes)), this.snapshotId)
      })
      .catch((error: unknown) => {
        this.manifestPromise = undefined
        throw error
      })
    return this.manifestPromise
  }

  async shared() {
    this.sharedPromise ??= this.manifest()
      .then(async (manifest) => sharedOf(decodeCatalogueArtifact(await this.bytes('shared.json', manifest.entries['shared.json']!))))
      .catch((error: unknown) => {
        this.sharedPromise = undefined
        throw error
      })
    return this.sharedPromise
  }

  async catalogue(catalogueId: string) {
    const manifest = await this.manifest()
    const name = Object.hasOwn(manifest.partitions, catalogueId) ? manifest.partitions[catalogueId] : null
    if (!name) return null
    const shared = await this.shared()
    const files = decodeCatalogueArtifact(await this.bytes(name, manifest.entries[name]!))
    if (!Array.isArray(files) || !files.every((file) => file && typeof file === 'object')) {
      throw new Error('Invalid Worker catalogue partition')
    }
    const index = buildIndex(files as CatalogueFile[], manifest.revision)
    if (!index.catalogues.has(catalogueId)) throw new Error('Worker catalogue partition has no faction')
    return catalogueFromIndex(index, files as CatalogueFile[], shared.datacards, shared.sourceReferences)
  }
}
