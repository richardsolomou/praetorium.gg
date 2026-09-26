import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { encodeCatalogueArtifact } from './catalogueArtifactCodec'
import { emptyExternalReferences } from './externalReferences'
import { WorkerCatalogueStore } from './workerCatalogueStore'

const snapshotId = 'a'.repeat(64)
const part = 'partitions/000000000000000000000000.json'
const encode = (value: unknown) => new TextEncoder().encode(encodeCatalogueArtifact(value)).buffer
const sha256 = (bytes: ArrayBuffer) => createHash('sha256').update(Buffer.from(bytes)).digest('hex')

function fixture() {
  const shared = encode({
    datacards: { factions: new Map() },
    sourceReferences: emptyExternalReferences(),
    rules: { byDetachment: new Map() },
    factionIndex: { revision: 'test-revision', factions: [] },
    factions: { revision: 'test-revision', factions: [] },
    combatUnits: [],
    searchIndex: { factions: [], detachments: [], datasheets: [] },
    history: null,
  })
  const partition = encode([
    { gameSystem: { id: 'system', name: 'Test system', costTypes: [{ id: 'points', name: 'pts' }] } },
    { catalogue: { id: 'army', name: 'Test army', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] } },
  ])
  const manifest = encode({
    format: 'praetorium.worker-catalogue.v1',
    snapshotId,
    revision: 'test-revision',
    entries: {
      'shared.json': { sha256: sha256(shared), bytes: shared.byteLength },
      [part]: { sha256: sha256(partition), bytes: partition.byteLength },
    },
    partitions: { army: part },
  })
  const objects = new Map([
    [`snapshots/${snapshotId}/manifest.json`, manifest],
    [`snapshots/${snapshotId}/shared.json`, shared],
    [`snapshots/${snapshotId}/${part}`, partition],
  ])
  const read = async (key: string, maxBytes: number) => {
    const bytes = objects.get(key)
    if (!bytes || bytes.byteLength > maxBytes) throw new Error('Catalogue object unavailable')
    return bytes
  }
  return { objects, read, manifestSha256: sha256(manifest) }
}

it('loads one verified faction partition with shared maps', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect((await store.catalogue('army'))?.index.definitions.has('unit')).toBe(true)
  expect((await store.shared()).rules.byDetachment).toBeInstanceOf(Map)
  expect(await store.catalogue('other')).toBeNull()
})

it('refuses a changed partition before building its index', async () => {
  const { objects, read, manifestSha256 } = fixture()
  objects.set(`snapshots/${snapshotId}/${part}`, encode([{ catalogue: { id: 'other', name: 'Other' } }]))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.catalogue('army')).rejects.toThrow('checksum does not match')
})

it('treats inherited object keys as absent factions', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect(await store.catalogue('toString')).toBeNull()
})

it('refuses a manifest whose hash differs from the deployed version', async () => {
  const { read } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, 'b'.repeat(64))
  await expect(store.catalogue('army')).rejects.toThrow('manifest checksum does not match')
})
