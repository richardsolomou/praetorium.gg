import { buildIndex, type CatalogueFile } from '../core/catalogue'
import { catalogueFromIndex, type LoadedCatalogue } from './catalogueIndex'
import { decodeCatalogueArtifact } from './catalogueArtifactCodec'
import type { LoadedDatacards } from './datacards'
import type { ExternalReferences } from './externalReferences'
import type { BattleMissionRules, BattleReadRules, LoadedRules, TerrainReadRules } from './rules'
import type { factionIndexFor } from './factionReferences'
import type { combatUnitsFor } from './combatUnits'
import type { CatalogueHistoryEntry } from '../core/catalogueHistory'
import type { factionsFor } from './factionReferences'
import type { GlobalSearchIndex } from './globalSearch'
import type { ReferenceCorpus } from './referenceCorpus'
import type { referenceFactions, referenceIndex } from './referenceService'
import type { CanonicalDatasheet, PickerUnit, UnitSummary } from '../contracts/catalogue'
import { finishReferenceSearch, rankReferencePart, type ReferenceSearchInput } from './referenceSearch'
import { globalSingleton } from 'ras-stack/server'
import type { BattleDetachmentData } from './battleDetachmentData'

type Entry = { sha256: string; bytes: number }
type PartitionRange = { offset: number; bytes: number; expandedBytes: number }
export type WorkerCatalogueManifest = {
  format: 'praetorium.worker-catalogue.v3'
  snapshotId: string
  revision: string
  entries: Record<string, Entry>
  partitions: Record<string, PartitionRange>
  referenceRanges: Record<string, PartitionRange>
  auxiliaryRanges: Record<string, PartitionRange>
  detachments: Record<string, string>
  pickers: Record<string, string>
  terrainMatchups: Record<string, string>
}
type Shared = {
  datacards: LoadedDatacards
  sourceReferences: ExternalReferences
  rules: LoadedRules
}
type Sources = Pick<Shared, 'datacards' | 'sourceReferences'>
type Navigation = {
  factionIndex: ReturnType<typeof factionIndexFor>
  factions: ReturnType<typeof factionsFor>
  factionNames: LoadedRules['factionNames']
  factionIcons: LoadedRules['factionIcons']
  combatUnits: ReturnType<typeof combatUnitsFor>
  referenceDatasheets: Map<string, UnitSummary[]>
  history: CatalogueHistoryEntry[] | null
}
type ReferenceMetadata = {
  revision: string
  revisions: ReferenceCorpus['catalogue']['revisions']
  index: ReturnType<typeof referenceIndex>
  factions: ReturnType<typeof referenceFactions>
  shards: string[]
  factionShards: Record<string, string>
  documentShards: Record<string, string>
  sheetAssets: Record<string, Record<string, string>>
  paths: string[]
}
type Read = (key: string, maxBytes: number) => Promise<ArrayBuffer>
type ResidentField = 'sources' | 'rules' | 'partitionBytes' | 'referenceBytes' | 'auxiliaryBytes'
type Resolved = {
  version: string
  manifest?: WorkerCatalogueManifest
  sources?: Sources
  rules?: LoadedRules
  shared?: Shared
  battleMissions?: BattleMissionRules
  battleReadRules?: BattleReadRules
  terrainTemplates?: TerrainReadRules['terrainTemplates']
  navigation?: Navigation
  searchIndex?: GlobalSearchIndex
  referenceMetadata?: ReferenceMetadata
  partitionBytes?: Uint8Array<ArrayBuffer>
  referenceBytes?: Uint8Array<ArrayBuffer>
  auxiliaryBytes?: Uint8Array<ArrayBuffer>
  loading?: Partial<Record<ResidentField, { startedAt: number }>>
}

function resolvedCache(): Resolved {
  return globalSingleton('praetorium.worker-catalogue-resolved', () => ({ version: '' }))
}

const MAX_MANIFEST_BYTES = 512 * 1024
const MAX_SOURCES_BYTES = 10 * 1024 * 1024
const MAX_RULES_BYTES = 12 * 1024 * 1024
const MAX_BATTLE_MISSIONS_BYTES = 128 * 1024
const MAX_BATTLE_READ_BYTES = 2 * 1024 * 1024
const MAX_TERRAIN_BYTES = 512 * 1024
const MAX_DETACHMENT_BYTES = 2 * 1024 * 1024
const MAX_NAVIGATION_BYTES = 2 * 1024 * 1024
const MAX_SEARCH_BYTES = 3 * 1024 * 1024
const MAX_PARTITION_BUNDLE_BYTES = 20 * 1024 * 1024
const MAX_REFERENCE_BUNDLE_BYTES = 12 * 1024 * 1024
const MAX_AUXILIARY_BUNDLE_BYTES = 4 * 1024 * 1024
const MAX_PARTITION_BYTES = 10 * 1024 * 1024
const MAX_PICKER_BYTES = 512 * 1024
const MAX_REFERENCE_METADATA_BYTES = 2 * 1024 * 1024
const MAX_REFERENCE_SHARD_BYTES = 8 * 1024 * 1024
const MAX_SHEET_BYTES = 1024 * 1024
const HASH = /^[0-9a-f]{64}$/
const ENTRY_LIMITS: Record<string, number> = {
  'partitions.bin': MAX_PARTITION_BUNDLE_BYTES,
  'references.bin': MAX_REFERENCE_BUNDLE_BYTES,
  'auxiliary.bin': MAX_AUXILIARY_BUNDLE_BYTES,
  'sources.json': MAX_SOURCES_BYTES,
  'rules.json': MAX_RULES_BYTES,
  'navigation.json': MAX_NAVIGATION_BYTES,
  'search.json': MAX_SEARCH_BYTES,
  'reference-meta.json': MAX_REFERENCE_METADATA_BYTES,
}

async function hash(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function inflatePartition(compressed: Uint8Array<ArrayBuffer>, expectedBytes: number) {
  const reader = new Blob([compressed.slice().buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > expectedBytes) {
        await reader.cancel()
        throw new Error('Worker catalogue partition is too large')
      }
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
  if (size !== expectedBytes) throw new Error('Worker catalogue partition size does not match')
  return text + decoder.decode()
}

export function workerCatalogueManifest(value: unknown, snapshotId: string): WorkerCatalogueManifest {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker catalogue manifest')
  const manifest = value as Partial<WorkerCatalogueManifest>
  if (
    manifest.format !== 'praetorium.worker-catalogue.v3' ||
    manifest.snapshotId !== snapshotId ||
    typeof manifest.revision !== 'string' ||
    !manifest.revision ||
    !manifest.entries ||
    !manifest.partitions ||
    !manifest.referenceRanges ||
    !manifest.auxiliaryRanges ||
    !manifest.detachments ||
    !manifest.pickers ||
    !manifest.terrainMatchups ||
    Object.keys(manifest.entries).length > 2000 ||
    Object.keys(manifest.detachments).length > 100 ||
    Object.keys(manifest.partitions).length !== Object.keys(manifest.detachments).length ||
    Object.keys(manifest.terrainMatchups).length > 50 ||
    Object.keys(manifest.pickers).length !== Object.keys(manifest.detachments).length
  ) {
    throw new Error('Invalid Worker catalogue manifest')
  }
  for (const [name, entry] of Object.entries(manifest.entries)) {
    if (
      !Object.hasOwn(ENTRY_LIMITS, name) ||
      !entry ||
      !HASH.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > ENTRY_LIMITS[name]!
    ) {
      throw new Error('Invalid Worker catalogue entry')
    }
  }
  if (!manifest.entries['sources.json']) throw new Error('Worker catalogue sources are missing')
  if (!manifest.entries['rules.json']) throw new Error('Worker catalogue rules are missing')
  if (!manifest.entries['navigation.json']) throw new Error('Worker catalogue navigation data is missing')
  if (!manifest.entries['search.json']) throw new Error('Worker catalogue search data is missing')
  if (!manifest.entries['reference-meta.json']) throw new Error('Worker reference metadata is missing')
  const bundle = manifest.entries['partitions.bin']
  if (!bundle) throw new Error('Worker catalogue partitions are missing')
  let partitionEnd = 0
  for (const [id, range] of Object.entries(manifest.partitions)) {
    if (
      !Object.hasOwn(manifest.detachments, id) ||
      !range ||
      !Number.isSafeInteger(range.offset) ||
      range.offset !== partitionEnd ||
      !Number.isSafeInteger(range.bytes) ||
      range.bytes < 1 ||
      range.bytes > bundle.bytes - partitionEnd ||
      !Number.isSafeInteger(range.expandedBytes) ||
      range.expandedBytes < 1 ||
      range.expandedBytes > MAX_PARTITION_BYTES
    ) {
      throw new Error('Invalid Worker catalogue partition range')
    }
    partitionEnd += range.bytes
  }
  if (partitionEnd !== bundle.bytes) throw new Error('Invalid Worker catalogue partition ranges')
  const references = manifest.entries['references.bin']
  if (!references) throw new Error('Worker catalogue references are missing')
  if (Object.keys(manifest.referenceRanges).length > 5000) throw new Error('Invalid Worker reference ranges')
  let referenceEnd = 0
  for (const [name, range] of Object.entries(manifest.referenceRanges)) {
    if (
      !/^references\/(?:global|[0-7]|factions\/[0-9a-f]{24}|sheets\/[0-9a-f]{24})\.json$/.test(name) ||
      !range ||
      !Number.isSafeInteger(range.offset) ||
      range.offset !== referenceEnd ||
      !Number.isSafeInteger(range.bytes) ||
      range.bytes < 1 ||
      range.bytes > references.bytes - referenceEnd ||
      !Number.isSafeInteger(range.expandedBytes) ||
      range.expandedBytes < 1 ||
      range.expandedBytes > (name.startsWith('references/sheets/') ? MAX_SHEET_BYTES : MAX_REFERENCE_SHARD_BYTES)
    ) {
      throw new Error('Invalid Worker reference range')
    }
    referenceEnd += range.bytes
  }
  if (referenceEnd !== references.bytes) throw new Error('Invalid Worker reference ranges')
  const auxiliary = manifest.entries['auxiliary.bin']
  if (!auxiliary) throw new Error('Worker auxiliary catalogue data is missing')
  if (Object.keys(manifest.auxiliaryRanges).length > 200) throw new Error('Invalid Worker auxiliary ranges')
  let auxiliaryEnd = 0
  for (const [name, range] of Object.entries(manifest.auxiliaryRanges)) {
    const limit =
      name === 'battle-missions.json'
        ? MAX_BATTLE_MISSIONS_BYTES
        : name === 'battle-read.json'
          ? MAX_BATTLE_READ_BYTES
          : name.startsWith('detachments/')
            ? MAX_DETACHMENT_BYTES
            : name.startsWith('pickers/')
              ? MAX_PICKER_BYTES
              : name.startsWith('terrain')
                ? MAX_TERRAIN_BYTES
                : 0
    if (
      !/^(?:battle-(?:missions|read)|terrain|terrain\/[0-9a-f]{24}|detachments\/[0-9a-f]{24}|pickers\/[0-9a-f]{24})\.json$/.test(name) ||
      !range ||
      !Number.isSafeInteger(range.offset) ||
      range.offset !== auxiliaryEnd ||
      !Number.isSafeInteger(range.bytes) ||
      range.bytes < 1 ||
      range.bytes > auxiliary.bytes - auxiliaryEnd ||
      !Number.isSafeInteger(range.expandedBytes) ||
      range.expandedBytes < 1 ||
      range.expandedBytes > limit
    )
      throw new Error('Invalid Worker auxiliary range')
    auxiliaryEnd += range.bytes
  }
  if (auxiliaryEnd !== auxiliary.bytes) throw new Error('Invalid Worker auxiliary ranges')
  if (!manifest.auxiliaryRanges['battle-missions.json']) throw new Error('Worker battle mission data is missing')
  if (!manifest.auxiliaryRanges['battle-read.json']) throw new Error('Worker battle read data is missing')
  if (!manifest.auxiliaryRanges['terrain.json']) throw new Error('Worker terrain data is missing')
  for (const [id, name] of Object.entries(manifest.detachments)) {
    if (
      !id ||
      id.length > 128 ||
      typeof name !== 'string' ||
      !name.startsWith('detachments/') ||
      !Object.hasOwn(manifest.auxiliaryRanges, name)
    ) {
      throw new Error('Worker battle detachment data is missing')
    }
    const picker = manifest.pickers[id]
    if (typeof picker !== 'string' || !picker.startsWith('pickers/') || !Object.hasOwn(manifest.auxiliaryRanges, picker)) {
      throw new Error('Invalid Worker catalogue picker')
    }
  }
  for (const [matchupId, name] of Object.entries(manifest.terrainMatchups)) {
    if (
      !/^[a-z0-9-]{1,128}$/.test(matchupId) ||
      typeof name !== 'string' ||
      !name.startsWith('terrain/') ||
      !manifest.auxiliaryRanges[name]
    ) {
      throw new Error('Invalid Worker terrain matchup')
    }
  }
  return manifest as WorkerCatalogueManifest
}

function sourcesOf(value: unknown): Sources {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker catalogue sources')
  const sources = value as Partial<Sources>
  if (!(sources.datacards?.factions instanceof Map) || !(sources.sourceReferences?.units?.byCanonicalId instanceof Map)) {
    throw new Error('Invalid Worker catalogue sources')
  }
  return sources as Sources
}

function rulesOf(value: unknown): LoadedRules {
  if (!value || typeof value !== 'object' || !('byDetachment' in value) || !(value.byDetachment instanceof Map)) {
    throw new Error('Invalid Worker catalogue rules')
  }
  return value as LoadedRules
}

function battleMissionsOf(value: unknown): BattleMissionRules {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker battle mission data')
  const rules = value as Partial<BattleMissionRules>
  if (!(rules.missions instanceof Map) || !(rules.fixedSecondaryCaps instanceof Map)) {
    throw new Error('Invalid Worker battle mission data')
  }
  return rules as BattleMissionRules
}

function battleReadRulesOf(value: unknown): BattleReadRules {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker battle read data')
  const rules = value as Partial<BattleReadRules>
  if (
    !(rules.missions instanceof Map) ||
    !(rules.fixedSecondaryCaps instanceof Map) ||
    !Array.isArray(rules.primaries) ||
    !Array.isArray(rules.secondaries) ||
    !(rules.missionTwists instanceof Map) ||
    !(rules.dispositions instanceof Map) ||
    !Array.isArray(rules.dispositionDetails) ||
    !Array.isArray(rules.deployments) ||
    typeof rules.attribution !== 'string'
  ) {
    throw new Error('Invalid Worker battle read data')
  }
  return rules as BattleReadRules
}

function terrainTemplatesOf(value: unknown): TerrainReadRules['terrainTemplates'] {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker terrain data')
  const terrain = value as Partial<TerrainReadRules>
  if (!Array.isArray(terrain.terrainTemplates)) {
    throw new Error('Invalid Worker terrain data')
  }
  return terrain.terrainTemplates
}

function terrainLayoutsOf(value: unknown): TerrainReadRules['terrainLayouts'] {
  if (!Array.isArray(value) || !value.every((layout) => layout && typeof layout === 'object' && typeof layout.matchupId === 'string')) {
    throw new Error('Invalid Worker terrain layouts')
  }
  return value as TerrainReadRules['terrainLayouts']
}

function battleDetachmentDataOf(value: unknown): BattleDetachmentData {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker battle detachment data')
  const data = value as Partial<BattleDetachmentData>
  if (
    !(data.index?.rules instanceof Map) ||
    !(data.live instanceof Map) ||
    !(data.details instanceof Map) ||
    !Array.isArray(data.core) ||
    !Array.isArray(data.coreDetails) ||
    typeof data.attribution !== 'string' ||
    (data.dataslate !== null && typeof data.dataslate !== 'string')
  ) {
    throw new Error('Invalid Worker battle detachment data')
  }
  return data as BattleDetachmentData
}

function navigationOf(value: unknown): Navigation {
  if (!value || typeof value !== 'object') throw new Error('Invalid Worker catalogue navigation data')
  const navigation = value as Partial<Navigation>
  if (
    !Array.isArray(navigation.factionIndex?.factions) ||
    !Array.isArray(navigation.factions?.factions) ||
    !(navigation.factionNames instanceof Map) ||
    !(navigation.factionIcons instanceof Map) ||
    !Array.isArray(navigation.combatUnits) ||
    !(navigation.referenceDatasheets instanceof Map) ||
    (navigation.history !== null && !Array.isArray(navigation.history))
  ) {
    throw new Error('Invalid Worker catalogue navigation data')
  }
  return navigation as Navigation
}

export class WorkerCatalogueStore {
  private cataloguePromises = new Map<string, Promise<LoadedCatalogue | null>>()
  private manifestPromise?: Promise<WorkerCatalogueManifest>
  private sourcesPromise?: Promise<Sources>
  private rulesPromise?: Promise<LoadedRules>
  private battleMissionsPromise?: Promise<BattleMissionRules>
  private battleReadRulesPromise?: Promise<BattleReadRules>
  private terrainPromise?: Promise<TerrainReadRules['terrainTemplates']>
  private navigationPromise?: Promise<Navigation>
  private searchPromise?: Promise<GlobalSearchIndex>
  private referenceMetadataPromise?: Promise<ReferenceMetadata>
  private readonly version: string

  constructor(
    private readonly read: Read,
    private readonly snapshotId: string,
    private readonly manifestSha256: string,
  ) {
    if (!HASH.test(snapshotId) || !HASH.test(manifestSha256)) throw new Error('Invalid Worker catalogue version')
    this.version = `${snapshotId}:${manifestSha256}`
  }

  private resolved() {
    const cache = resolvedCache()
    if (cache.version !== this.version) {
      cache.version = this.version
      delete cache.manifest
      delete cache.sources
      delete cache.rules
      delete cache.shared
      delete cache.battleMissions
      delete cache.battleReadRules
      delete cache.terrainTemplates
      delete cache.navigation
      delete cache.searchIndex
      delete cache.referenceMetadata
      delete cache.partitionBytes
      delete cache.referenceBytes
      delete cache.auxiliaryBytes
      delete cache.loading
    }
    return cache
  }

  private key(name: string) {
    return `snapshots/${this.snapshotId}/${this.manifestSha256}/${name}`
  }

  private async verifiedBytes(name: string, entry: Entry) {
    const bytes = await this.read(this.key(name), entry.bytes)
    if (bytes.byteLength !== entry.bytes || (await hash(bytes)) !== entry.sha256) {
      throw new Error(`Worker catalogue ${name} checksum does not match`)
    }
    return bytes
  }

  private async bytes(name: string, entry: Entry) {
    return new TextDecoder().decode(await this.verifiedBytes(name, entry))
  }

  private async resident<K extends ResidentField>(
    field: K,
    load: () => Promise<NonNullable<Resolved[K]>>,
  ): Promise<NonNullable<Resolved[K]>> {
    for (;;) {
      const cache = this.resolved()
      const cached = cache[field]
      if (cached) return cached
      const loading = cache.loading?.[field]
      if (!loading || Date.now() - loading.startedAt > 10_000) {
        const owner = { startedAt: Date.now() }
        const inFlight = (cache.loading ??= {})
        inFlight[field] = owner
        try {
          const value = await load()
          if (cache.version === this.version) cache[field] = value
          return value
        } finally {
          if (cache.loading?.[field] === owner) delete cache.loading[field]
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }

  private manifest() {
    const cached = this.resolved().manifest
    if (cached) return Promise.resolve(cached)
    this.manifestPromise ??= this.read(this.key('manifest.json'), MAX_MANIFEST_BYTES)
      .then(async (bytes) => {
        if (bytes.byteLength > MAX_MANIFEST_BYTES || (await hash(bytes)) !== this.manifestSha256) {
          throw new Error('Worker catalogue manifest checksum does not match')
        }
        const manifest = workerCatalogueManifest(JSON.parse(new TextDecoder().decode(bytes)), this.snapshotId)
        const cache = resolvedCache()
        if (cache.version === this.version) cache.manifest = manifest
        return manifest
      })
      .catch((error: unknown) => {
        this.manifestPromise = undefined
        throw error
      })
    return this.manifestPromise
  }

  private async sources() {
    this.sourcesPromise ??= this.resident('sources', async () => {
      const manifest = await this.manifest()
      return sourcesOf(decodeCatalogueArtifact(await this.bytes('sources.json', manifest.entries['sources.json']!)))
    }).catch((error: unknown) => {
      this.sourcesPromise = undefined
      throw error
    })
    return this.sourcesPromise
  }

  private async rules() {
    this.rulesPromise ??= this.resident('rules', async () => {
      const manifest = await this.manifest()
      return rulesOf(decodeCatalogueArtifact(await this.bytes('rules.json', manifest.entries['rules.json']!)))
    }).catch((error: unknown) => {
      this.rulesPromise = undefined
      throw error
    })
    return this.rulesPromise
  }

  async shared(): Promise<Shared> {
    const cached = this.resolved().shared
    if (cached) return cached
    const [sources, rules] = await Promise.all([this.sources(), this.rules()])
    const cache = resolvedCache()
    if (cache.version !== this.version) return { ...sources, rules }
    return (cache.shared ??= { ...sources, rules })
  }

  async battleMissions() {
    const cached = this.resolved().battleMissions
    if (cached) return cached
    this.battleMissionsPromise ??= this.manifest()
      .then(async (manifest) => {
        const rules = battleMissionsOf(await this.auxiliaryValue('battle-missions.json', manifest))
        const cache = resolvedCache()
        if (cache.version === this.version) cache.battleMissions = rules
        return rules
      })
      .catch((error: unknown) => {
        this.battleMissionsPromise = undefined
        throw error
      })
    return this.battleMissionsPromise
  }

  async battleReadRules() {
    const cached = this.resolved().battleReadRules
    if (cached) return cached
    this.battleReadRulesPromise ??= this.manifest()
      .then(async (manifest) => {
        const rules = battleReadRulesOf(await this.auxiliaryValue('battle-read.json', manifest))
        const cache = resolvedCache()
        if (cache.version === this.version) cache.battleReadRules = rules
        return rules
      })
      .catch((error: unknown) => {
        this.battleReadRulesPromise = undefined
        throw error
      })
    return this.battleReadRulesPromise
  }

  private async terrainTemplates() {
    const cached = this.resolved().terrainTemplates
    if (cached) return cached
    this.terrainPromise ??= this.manifest()
      .then(async (manifest) => {
        const terrain = terrainTemplatesOf(await this.auxiliaryValue('terrain.json', manifest))
        const cache = resolvedCache()
        if (cache.version === this.version) cache.terrainTemplates = terrain
        return terrain
      })
      .catch((error: unknown) => {
        this.terrainPromise = undefined
        throw error
      })
    return this.terrainPromise
  }

  async terrain(matchupIds: readonly string[]): Promise<TerrainReadRules> {
    const manifest = await this.manifest()
    const [terrainTemplates, ...groups] = await Promise.all([
      this.terrainTemplates(),
      ...[...new Set(matchupIds)].map(async (matchupId) => {
        const name = Object.hasOwn(manifest.terrainMatchups, matchupId) ? manifest.terrainMatchups[matchupId] : null
        if (!name) return []
        const layouts = terrainLayoutsOf(await this.auxiliaryValue(name, manifest))
        if (layouts.some((layout) => layout.matchupId !== matchupId)) throw new Error('Invalid Worker terrain matchup layouts')
        return layouts
      }),
    ])
    return { terrainTemplates, terrainLayouts: groups.flat() }
  }

  async detachmentRead(catalogueId: string): Promise<BattleDetachmentData | null> {
    const manifest = await this.manifest()
    const name = Object.hasOwn(manifest.detachments, catalogueId) ? manifest.detachments[catalogueId] : null
    if (!name) return null
    return battleDetachmentDataOf(await this.auxiliaryValue(name, manifest))
  }

  async navigation() {
    const cached = this.resolved().navigation
    if (cached) return cached
    this.navigationPromise ??= this.manifest()
      .then(async (manifest) => {
        const navigation = navigationOf(decodeCatalogueArtifact(await this.bytes('navigation.json', manifest.entries['navigation.json']!)))
        const cache = resolvedCache()
        if (cache.version === this.version) cache.navigation = navigation
        return navigation
      })
      .catch((error: unknown) => {
        this.navigationPromise = undefined
        throw error
      })
    return this.navigationPromise
  }

  async rosterLabelRules() {
    return { factionNames: (await this.navigation()).factionNames }
  }

  async searchIndex() {
    const cached = this.resolved().searchIndex
    if (cached) return cached
    this.searchPromise ??= this.manifest()
      .then(async (manifest) => {
        const value = decodeCatalogueArtifact(await this.bytes('search.json', manifest.entries['search.json']!))
        if (!value || typeof value !== 'object') throw new Error('Invalid Worker catalogue search data')
        const index = value as Partial<GlobalSearchIndex>
        if (
          !Array.isArray(index.factions) ||
          !Array.isArray(index.detachments) ||
          !Array.isArray(index.datasheets) ||
          !Array.isArray(index.missions) ||
          !Array.isArray(index.rules)
        ) {
          throw new Error('Invalid Worker catalogue search data')
        }
        const verified = index as GlobalSearchIndex
        const cache = resolvedCache()
        if (cache.version === this.version) cache.searchIndex = verified
        return verified
      })
      .catch((error: unknown) => {
        this.searchPromise = undefined
        throw error
      })
    return this.searchPromise
  }

  async catalogue(catalogueId: string) {
    const manifest = await this.manifest()
    const range = Object.hasOwn(manifest.partitions, catalogueId) ? manifest.partitions[catalogueId] : null
    if (!range) return null
    const existing = this.cataloguePromises.get(catalogueId)
    if (existing) return existing
    const pending = this.loadCatalogue(manifest, catalogueId, range)
    this.cataloguePromises.set(catalogueId, pending)
    try {
      return await pending
    } finally {
      this.cataloguePromises.delete(catalogueId)
    }
  }

  async preload() {
    const manifest = await this.manifest()
    await Promise.all([this.partitionData(manifest), this.referenceData(manifest), this.auxiliaryData(manifest), this.referenceMetadata()])
    await this.sources()
    await this.rules()
  }

  private async partitionData(manifest: WorkerCatalogueManifest): Promise<Uint8Array<ArrayBuffer>> {
    return this.resident(
      'partitionBytes',
      async () => new Uint8Array(await this.verifiedBytes('partitions.bin', manifest.entries['partitions.bin']!)),
    )
  }

  private async referenceData(manifest: WorkerCatalogueManifest): Promise<Uint8Array<ArrayBuffer>> {
    return this.resident(
      'referenceBytes',
      async () => new Uint8Array(await this.verifiedBytes('references.bin', manifest.entries['references.bin']!)),
    )
  }

  private async auxiliaryData(manifest: WorkerCatalogueManifest): Promise<Uint8Array<ArrayBuffer>> {
    return this.resident(
      'auxiliaryBytes',
      async () => new Uint8Array(await this.verifiedBytes('auxiliary.bin', manifest.entries['auxiliary.bin']!)),
    )
  }

  private async auxiliaryValue(name: string, manifest: WorkerCatalogueManifest) {
    const range = Object.hasOwn(manifest.auxiliaryRanges, name) ? manifest.auxiliaryRanges[name] : null
    if (!range) throw new Error('Invalid Worker auxiliary asset')
    const bundle = await this.auxiliaryData(manifest)
    return decodeCatalogueArtifact(await inflatePartition(bundle.subarray(range.offset, range.offset + range.bytes), range.expandedBytes))
  }

  private async referenceValue(name: string, manifest: WorkerCatalogueManifest) {
    const range = Object.hasOwn(manifest.referenceRanges, name) ? manifest.referenceRanges[name] : null
    if (!range) throw new Error('Invalid Worker reference asset')
    const bundle = await this.referenceData(manifest)
    return decodeCatalogueArtifact(await inflatePartition(bundle.subarray(range.offset, range.offset + range.bytes), range.expandedBytes))
  }

  private async loadCatalogue(manifest: WorkerCatalogueManifest, catalogueId: string, range: PartitionRange) {
    const [sources, bundle] = await Promise.all([this.sources(), this.partitionData(manifest)])
    const compressed = bundle.subarray(range.offset, range.offset + range.bytes)
    const files: unknown = JSON.parse(await inflatePartition(compressed, range.expandedBytes))
    if (!Array.isArray(files) || !files.every((file) => file && typeof file === 'object' && (file.catalogue || file.gameSystem))) {
      throw new Error('Invalid Worker catalogue partition')
    }
    const index = buildIndex(files, manifest.revision)
    if (!index.catalogues.has(catalogueId)) throw new Error('Worker catalogue partition has no faction')
    return catalogueFromIndex(index, files as CatalogueFile[], sources.datacards, sources.sourceReferences)
  }

  async pickerUnits(catalogueId: string): Promise<PickerUnit[] | null> {
    const manifest = await this.manifest()
    const name = Object.hasOwn(manifest.pickers, catalogueId) ? manifest.pickers[catalogueId] : null
    if (!name) return null
    const units = await this.auxiliaryValue(name, manifest)
    if (
      !Array.isArray(units) ||
      units.length > 1000 ||
      !units.every(
        (unit) =>
          unit &&
          typeof unit === 'object' &&
          typeof unit.id === 'string' &&
          typeof unit.name === 'string' &&
          (unit.search === null ||
            (unit.search &&
              typeof unit.search.name === 'string' &&
              ['keywords', 'abilities', 'weapons', 'weaponKeywords', 'wargear'].every((field) => Array.isArray(unit.search[field])))),
      )
    ) {
      throw new Error('Invalid Worker catalogue picker')
    }
    return units as PickerUnit[]
  }

  async referenceDatasheets(catalogueId: string) {
    return (await this.navigation()).referenceDatasheets.get(catalogueId) ?? null
  }

  async factionIcon(id: string) {
    return (await this.navigation()).factionIcons.get(id) ?? null
  }

  async referenceDatasheet(catalogueId: string, slug: string) {
    const metadata = await this.referenceMetadata()
    const sheets = Object.hasOwn(metadata.sheetAssets, catalogueId) ? metadata.sheetAssets[catalogueId] : null
    const name = sheets && Object.hasOwn(sheets, slug) ? sheets[slug] : null
    if (!name) return null
    const manifest = await this.manifest()
    const value = (await this.referenceValue(name, manifest)) as Partial<CanonicalDatasheet> | null
    if (!value || typeof value !== 'object' || value.catalogueId !== catalogueId || value.slug !== slug) {
      throw new Error('Invalid Worker reference datasheet')
    }
    return value as CanonicalDatasheet
  }

  async referenceMetadata(): Promise<ReferenceMetadata> {
    const cached = this.resolved().referenceMetadata
    if (cached) return cached
    this.referenceMetadataPromise ??= this.manifest()
      .then(async (manifest) => {
        const value = decodeCatalogueArtifact(await this.bytes('reference-meta.json', manifest.entries['reference-meta.json']!))
        if (!value || typeof value !== 'object') throw new Error('Invalid Worker reference metadata')
        const metadata = value as Partial<ReferenceMetadata>
        if (
          !HASH.test(metadata.revision ?? '') ||
          !metadata.revisions ||
          !Array.isArray(metadata.index?.factions) ||
          !Array.isArray(metadata.factions) ||
          !Array.isArray(metadata.shards) ||
          metadata.shards.length < 1 ||
          metadata.shards.length > 9 ||
          !metadata.factionShards ||
          !metadata.documentShards ||
          !metadata.sheetAssets ||
          !Array.isArray(metadata.paths) ||
          metadata.paths.length > 10_000
        ) {
          throw new Error('Invalid Worker reference metadata')
        }
        const shards = new Set(metadata.shards)
        const factionShards = new Set(Object.values(metadata.factionShards))
        const sheetMaps = Object.values(metadata.sheetAssets)
        if (sheetMaps.some((sheets) => !sheets || typeof sheets !== 'object' || Array.isArray(sheets))) {
          throw new Error('Invalid Worker reference metadata')
        }
        const sheetAssets = sheetMaps.flatMap((sheets) => Object.values(sheets))
        if (
          !shards.has('references/global.json') ||
          [...shards].some((name) => !manifest.referenceRanges[name]) ||
          [...factionShards].some((name) => !name.startsWith('references/factions/') || !manifest.referenceRanges[name]) ||
          Object.values(metadata.documentShards).some((name) => !shards.has(name) && !factionShards.has(name)) ||
          sheetAssets.length > 5000 ||
          sheetAssets.some(
            (name) => typeof name !== 'string' || !name.startsWith('references/sheets/') || !manifest.referenceRanges[name],
          ) ||
          metadata.paths.some((name) => typeof name !== 'string' || !name.startsWith('/') || name.length > 500)
        ) {
          throw new Error('Invalid Worker reference metadata')
        }
        const verified = metadata as ReferenceMetadata
        const cache = resolvedCache()
        if (cache.version === this.version) cache.referenceMetadata = verified
        return verified
      })
      .catch((error: unknown) => {
        this.referenceMetadataPromise = undefined
        throw error
      })
    return this.referenceMetadataPromise
  }

  async referenceShard(name: string): Promise<ReferenceCorpus> {
    const [manifest, metadata] = await Promise.all([this.manifest(), this.referenceMetadata()])
    if (!metadata.shards.includes(name) && !Object.values(metadata.factionShards).includes(name)) {
      throw new Error('Invalid Worker reference shard')
    }
    const value = await this.referenceValue(name, manifest)
    if (!value || typeof value !== 'object') throw new Error('Invalid Worker reference shard')
    const corpus = value as Partial<ReferenceCorpus>
    if (
      corpus.revision !== metadata.revision ||
      !Array.isArray(corpus.catalogue?.datasheets) ||
      !Array.isArray(corpus.catalogue.detachments) ||
      !Array.isArray(corpus.catalogue.ruleDocuments) ||
      !Array.isArray(corpus.documents)
    ) {
      throw new Error('Invalid Worker reference shard')
    }
    return {
      catalogue: corpus.catalogue,
      documents: corpus.documents,
      revision: corpus.revision,
      byId: new Map(corpus.documents.map((document) => [document.id, document])),
    }
  }

  async referenceForDocument(id: string) {
    const metadata = await this.referenceMetadata()
    const name = Object.hasOwn(metadata.documentShards, id) ? metadata.documentShards[id] : null
    return name ? this.referenceShard(name) : null
  }

  async referenceForFaction(id: string) {
    const metadata = await this.referenceMetadata()
    const name = Object.hasOwn(metadata.factionShards, id) ? metadata.factionShards[id] : null
    return name ? this.referenceShard(name) : null
  }

  async searchReferences(input: ReferenceSearchInput) {
    const metadata = await this.referenceMetadata()
    const matches: ReturnType<typeof rankReferencePart> = []
    for (const name of metadata.shards) matches.push(...rankReferencePart(await this.referenceShard(name), input))
    return finishReferenceSearch(input, metadata.revisions, matches)
  }
}
