import { createHash } from 'node:crypto'
import { clearGlobalSingleton } from 'ras-stack/server'
import { beforeEach, expect, it } from 'vitest'
import { encodeCatalogueArtifact } from './catalogueArtifactCodec'
import { emptyExternalReferences } from './externalReferences'
import { WorkerCatalogueStore } from './workerCatalogueStore'

const snapshotId = 'a'.repeat(64)
const part = 'partitions/000000000000000000000000.json'
const globalReference = 'references/global.json'
const factionReference = 'references/factions/000000000000000000000000.json'
const sheetReference = 'references/sheets/000000000000000000000000.json'
const documentId = 'rule:core:move'
const datasheetDocumentId = 'datasheet:army:unit'
const encode = (value: unknown) => new TextEncoder().encode(encodeCatalogueArtifact(value)).buffer
const sha256 = (bytes: ArrayBuffer) => createHash('sha256').update(Buffer.from(bytes)).digest('hex')

beforeEach(async () => {
  await clearGlobalSingleton('praetorium.worker-catalogue-resolved')
})

function fixture() {
  const shared = encode({
    datacards: { factions: new Map() },
    sourceReferences: emptyExternalReferences(),
    rules: { byDetachment: new Map() },
  })
  const navigation = encode({
    factionIndex: { revision: 'test-revision', factions: [] },
    factions: { revision: 'test-revision', factions: [] },
    factionIcons: new Map([['army', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=']]),
    combatUnits: [],
    referenceDatasheets: new Map([['army', [{ id: 'unit', slug: 'unit', name: 'Unit' }]]]),
    history: null,
  })
  const searchIndex = encode({ factions: [], detachments: [], datasheets: [], missions: [], rules: [] })
  const partition = encode([
    { gameSystem: { id: 'system', name: 'Test system', costTypes: [{ id: 'points', name: 'pts' }] } },
    { catalogue: { id: 'army', name: 'Test army', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] } },
  ])
  const referenceShard = encode({
    catalogue: {
      datasheets: [{ catalogueId: 'army', slug: 'unit', name: 'Unit' }],
      detachments: [],
      ruleDocuments: [],
      revisions: {},
    },
    documents: [
      {
        id: datasheetDocumentId,
        kind: 'datasheet',
        title: 'Unit',
        faction: 'Test army',
        url: '/factions/army/datasheets/unit',
        sections: [],
        revisions: {},
        attribution: [],
      },
      {
        id: documentId,
        kind: 'rule',
        title: 'Move Units',
        faction: null,
        url: '/rules/core/move',
        sections: [{ id: 'move', title: 'Move Units', text: 'Move across the battlefield.', url: '/rules/core/move#move' }],
        revisions: {},
        attribution: [],
      },
    ],
    revision: 'b'.repeat(64),
  })
  const sheet = encode({ catalogueId: 'army', slug: 'unit', name: 'Unit' })
  const referenceMetadata = encode({
    revision: 'b'.repeat(64),
    revisions: {},
    index: { factions: [] },
    factions: [],
    shards: [globalReference],
    factionShards: { army: factionReference },
    documentShards: { [documentId]: globalReference, [datasheetDocumentId]: factionReference },
    sheetAssets: { army: { unit: sheetReference } },
    paths: ['/factions', '/rules'],
  })
  const manifest = encode({
    format: 'praetorium.worker-catalogue.v1',
    snapshotId,
    revision: 'test-revision',
    entries: {
      'shared.json': { sha256: sha256(shared), bytes: shared.byteLength },
      'navigation.json': { sha256: sha256(navigation), bytes: navigation.byteLength },
      'search.json': { sha256: sha256(searchIndex), bytes: searchIndex.byteLength },
      'reference-meta.json': { sha256: sha256(referenceMetadata), bytes: referenceMetadata.byteLength },
      [globalReference]: { sha256: sha256(referenceShard), bytes: referenceShard.byteLength },
      [factionReference]: { sha256: sha256(referenceShard), bytes: referenceShard.byteLength },
      [sheetReference]: { sha256: sha256(sheet), bytes: sheet.byteLength },
      [part]: { sha256: sha256(partition), bytes: partition.byteLength },
    },
    partitions: { army: part },
  })
  const manifestSha256 = sha256(manifest)
  const prefix = `snapshots/${snapshotId}/${manifestSha256}`
  const objects = new Map([
    [`${prefix}/manifest.json`, manifest],
    [`${prefix}/shared.json`, shared],
    [`${prefix}/navigation.json`, navigation],
    [`${prefix}/search.json`, searchIndex],
    [`${prefix}/reference-meta.json`, referenceMetadata],
    [`${prefix}/${globalReference}`, referenceShard],
    [`${prefix}/${factionReference}`, referenceShard],
    [`${prefix}/${sheetReference}`, sheet],
    [`${prefix}/${part}`, partition],
  ])
  const read = async (key: string, maxBytes: number) => {
    const bytes = objects.get(key)
    if (!bytes || bytes.byteLength > maxBytes) throw new Error('Catalogue object unavailable')
    return bytes
  }
  return { objects, read, manifestSha256, prefix }
}

it('loads one verified faction partition with shared maps', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect((await store.catalogue('army'))?.index.definitions.has('unit')).toBe(true)
  expect((await store.shared()).rules.byDetachment).toBeInstanceOf(Map)
  expect((await store.referenceMetadata()).revision).toBe('b'.repeat(64))
  expect(await store.catalogue('other')).toBeNull()
})

it('starts a faction partition read while shared data is loading', async () => {
  const { read, manifestSha256 } = fixture()
  const started: string[] = []
  let releaseShared!: () => void
  let sharedStarted!: () => void
  const sharedReading = new Promise<void>((resolve) => {
    sharedStarted = resolve
  })
  const sharedReady = new Promise<void>((resolve) => {
    releaseShared = resolve
  })
  const store = new WorkerCatalogueStore(
    async (key, maxBytes) => {
      if (key.endsWith('/shared.json') || key.includes('/partitions/')) started.push(key)
      if (key.endsWith('/shared.json')) {
        sharedStarted()
        await sharedReady
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )

  const loading = store.catalogue('army')
  await sharedReading
  await new Promise(setImmediate)
  const partitionStartedBeforeShared = started.some((key) => key.includes('/partitions/'))
  releaseShared()
  await loading
  expect(partitionStartedBeforeShared).toBe(true)
})

it('serves the initial faction list from eager shared data', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.includes('/partitions/') || key.endsWith('/shared.json')) throw new Error('unrelated data should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.referenceDatasheets('army'))?.map((sheet) => sheet.name)).toEqual(['Unit'])
  expect(await store.factionIcon('army')).toMatch(/^data:image\/svg\+xml;base64,/)
  expect((await store.searchIndex()).datasheets).toEqual([])
})

it('serves a reference datasheet without loading its faction partition', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (
        key.includes('/partitions/') ||
        key.endsWith('/shared.json') ||
        key.endsWith('/references/global.json') ||
        key.endsWith(`/${factionReference}`)
      ) {
        throw new Error('unrelated shard should not be read')
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.referenceDatasheet('army', 'unit'))?.name).toBe('Unit')
})

it('rejects a changed individual datasheet', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${sheetReference}`, encode({ catalogueId: 'army', slug: 'unit', name: 'Fake' }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.referenceDatasheet('army', 'unit')).rejects.toThrow('checksum does not match')
})

it('refuses a changed partition before building its index', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${part}`, encode([{ catalogue: { id: 'other', name: 'Other' } }]))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.catalogue('army')).rejects.toThrow('checksum does not match')
})

it('treats inherited object keys as absent factions', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect(await store.catalogue('toString')).toBeNull()
})

it('looks up one verified reference document without loading other shards', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect((await store.referenceForDocument(documentId))?.byId.get(documentId)?.title).toBe('Move Units')
})

it('reads a datasheet document from its dedicated faction shard', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/references/global.json')) throw new Error('search shard should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.referenceForDocument(datasheetDocumentId))?.byId.get(datasheetDocumentId)?.title).toBe('Unit')
})

it('finds a reference through a bounded shard search', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect((await store.searchReferences({ query: 'battlefield' })).results[0]?.id).toBe(documentId)
})

it('refuses a manifest whose hash differs from the deployed version', async () => {
  const { objects, read, prefix } = fixture()
  objects.set(`snapshots/${snapshotId}/${'b'.repeat(64)}/manifest.json`, objects.get(`${prefix}/manifest.json`)!)
  const store = new WorkerCatalogueStore(read, snapshotId, 'b'.repeat(64))
  await expect(store.catalogue('army')).rejects.toThrow('manifest checksum does not match')
})

it('retries a transient shared object read failure', async () => {
  const { read, manifestSha256 } = fixture()
  let unavailable = true
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/shared.json') && unavailable) throw new Error('Asset unavailable')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  await expect(store.shared()).rejects.toThrow('Asset unavailable')
  unavailable = false
  expect((await store.shared()).datacards.factions).toBeInstanceOf(Map)
})

it('reuses verified shared data after the request that loaded it ends', async () => {
  const { read, manifestSha256 } = fixture()
  const first = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  const shared = await first.shared()
  const second = new WorkerCatalogueStore(
    async () => {
      throw new Error('unexpected asset read')
    },
    snapshotId,
    manifestSha256,
  )

  expect(await second.shared()).toBe(shared)
})

it('does not share an unfinished asset read with another request', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  let release!: (bytes: ArrayBuffer) => void
  let entered!: () => void
  const waiting = new Promise<void>((resolve) => {
    entered = resolve
  })
  const first = new WorkerCatalogueStore(
    (key, maxBytes) =>
      key.endsWith('/shared.json')
        ? new Promise<ArrayBuffer>((resolve) => {
            release = resolve
            entered()
          })
        : read(key, maxBytes),
    snapshotId,
    manifestSha256,
  )
  const pending = first.shared()
  await waiting
  const second = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  const shared = await second.shared()
  release(objects.get(`${prefix}/shared.json`)!)
  await pending

  expect(shared.datacards.factions).toBeInstanceOf(Map)
})
