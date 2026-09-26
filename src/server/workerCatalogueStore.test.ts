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
    factionIndex: { revision: 'test-revision', factions: [] },
    factions: { revision: 'test-revision', factions: [] },
    combatUnits: [],
    searchIndex: { factions: [], detachments: [], datasheets: [] },
    referenceDatasheets: new Map([['army', [{ id: 'unit', slug: 'unit', name: 'Unit' }]]]),
    history: null,
  })
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
  const referenceMetadata = encode({
    revision: 'b'.repeat(64),
    revisions: {},
    index: { factions: [] },
    factions: [],
    shards: [globalReference],
    factionShards: { army: factionReference },
    documentShards: { [documentId]: globalReference, [datasheetDocumentId]: factionReference },
    paths: ['/factions', '/rules'],
  })
  const manifest = encode({
    format: 'praetorium.worker-catalogue.v1',
    snapshotId,
    revision: 'test-revision',
    entries: {
      'shared.json': { sha256: sha256(shared), bytes: shared.byteLength },
      'reference-meta.json': { sha256: sha256(referenceMetadata), bytes: referenceMetadata.byteLength },
      [globalReference]: { sha256: sha256(referenceShard), bytes: referenceShard.byteLength },
      [factionReference]: { sha256: sha256(referenceShard), bytes: referenceShard.byteLength },
      [part]: { sha256: sha256(partition), bytes: partition.byteLength },
    },
    partitions: { army: part },
  })
  const manifestSha256 = sha256(manifest)
  const prefix = `snapshots/${snapshotId}/${manifestSha256}`
  const objects = new Map([
    [`${prefix}/manifest.json`, manifest],
    [`${prefix}/shared.json`, shared],
    [`${prefix}/reference-meta.json`, referenceMetadata],
    [`${prefix}/${globalReference}`, referenceShard],
    [`${prefix}/${factionReference}`, referenceShard],
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

it('serves the initial faction list from eager shared data', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.includes('/partitions/')) throw new Error('partition should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.referenceDatasheets('army'))?.map((sheet) => sheet.name)).toEqual(['Unit'])
})

it('serves a reference datasheet without loading its faction partition', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.includes('/partitions/') || key.endsWith('/references/global.json')) throw new Error('unrelated shard should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.referenceDatasheet('army', 'unit'))?.name).toBe('Unit')
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
      if (key.endsWith('/shared.json') && unavailable) throw new Error('R2 unavailable')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  await expect(store.shared()).rejects.toThrow('R2 unavailable')
  unavailable = false
  expect((await store.shared()).factions.factions).toEqual([])
})

it('reuses verified shared data after the request that loaded it ends', async () => {
  const { read, manifestSha256 } = fixture()
  const first = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  const shared = await first.shared()
  const second = new WorkerCatalogueStore(
    async () => {
      throw new Error('unexpected R2 read')
    },
    snapshotId,
    manifestSha256,
  )

  expect(await second.shared()).toBe(shared)
})

it('does not share an unfinished R2 read with another request', async () => {
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

  expect(shared.factions.factions).toEqual([])
})
