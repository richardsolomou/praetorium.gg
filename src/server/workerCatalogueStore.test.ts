import { createHash } from 'node:crypto'
import { clearGlobalSingleton } from 'ras-stack/server'
import { beforeEach, expect, it } from 'vitest'
import { encodeCatalogueArtifact } from './catalogueArtifactCodec'
import { emptyExternalReferences } from './externalReferences'
import { missionFor } from './rules'
import { WorkerCatalogueStore, workerCatalogueManifest } from './workerCatalogueStore'
import { selectedBattleDetachmentData } from './battleDetachmentData'

const snapshotId = 'a'.repeat(64)
const part = 'partitions/000000000000000000000000.json'
const detachment = 'detachments/000000000000000000000000.json'
const terrainMatchup = 'terrain/000000000000000000000000.json'
const picker = 'pickers/000000000000000000000000.json'
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

function fixture(layoutMatchupId = 'one-vs-two') {
  const shared = encode({
    datacards: { factions: new Map() },
    sourceReferences: emptyExternalReferences(),
    rules: { byDetachment: new Map() },
  })
  const battleMissions = encode({
    missions: new Map([['pack|one|two', { name: 'Vital Link', packId: 'pack' }]]),
    fixedSecondaryCaps: new Map([['pack', 20]]),
  })
  const battleRead = encode({
    missions: new Map([['pack|one|two', { name: 'Vital Link', packId: 'pack' }]]),
    fixedSecondaryCaps: new Map([['pack', 20]]),
    primaries: [],
    secondaries: [],
    missionTwists: new Map(),
    dispositions: new Map(),
    dispositionDetails: [],
    deployments: [],
    attribution: 'Test source',
  })
  const terrain = encode({ terrainTemplates: [] })
  const layouts = encode([{ matchupId: layoutMatchupId }])
  const detachmentRead = encode({
    index: { rules: new Map() },
    live: new Map(),
    details: new Map(),
    core: [],
    coreDetails: [],
    attribution: 'Test source',
    dataslate: null,
  })
  const navigation = encode({
    factionIndex: { revision: 'test-revision', factions: [] },
    factions: { revision: 'test-revision', factions: [] },
    factionNames: new Map([['army', 'Test army']]),
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
  const pickerUnits = encode([
    {
      id: 'unit',
      slug: 'unit',
      name: 'Unit',
      points: 100,
      group: 'infantry',
      limit: 3,
      allied: false,
      alliedFaction: null,
      search: { name: 'Unit', keywords: ['Infantry'], abilities: [], weapons: [], weaponKeywords: [], wargear: [] },
    },
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
    format: 'praetorium.worker-catalogue.v2',
    snapshotId,
    revision: 'test-revision',
    entries: {
      'shared.json': { sha256: sha256(shared), bytes: shared.byteLength },
      'battle-missions.json': { sha256: sha256(battleMissions), bytes: battleMissions.byteLength },
      'battle-read.json': { sha256: sha256(battleRead), bytes: battleRead.byteLength },
      'terrain.json': { sha256: sha256(terrain), bytes: terrain.byteLength },
      [terrainMatchup]: { sha256: sha256(layouts), bytes: layouts.byteLength },
      [detachment]: { sha256: sha256(detachmentRead), bytes: detachmentRead.byteLength },
      'navigation.json': { sha256: sha256(navigation), bytes: navigation.byteLength },
      'search.json': { sha256: sha256(searchIndex), bytes: searchIndex.byteLength },
      'reference-meta.json': { sha256: sha256(referenceMetadata), bytes: referenceMetadata.byteLength },
      [globalReference]: { sha256: sha256(referenceShard), bytes: referenceShard.byteLength },
      [factionReference]: { sha256: sha256(referenceShard), bytes: referenceShard.byteLength },
      [sheetReference]: { sha256: sha256(sheet), bytes: sheet.byteLength },
      [part]: { sha256: sha256(partition), bytes: partition.byteLength },
      [picker]: { sha256: sha256(pickerUnits), bytes: pickerUnits.byteLength },
    },
    partitions: { army: part },
    pickers: { army: picker },
    terrainMatchups: { 'one-vs-two': terrainMatchup },
  })
  const manifestSha256 = sha256(manifest)
  const prefix = `snapshots/${snapshotId}/${manifestSha256}`
  const objects = new Map([
    [`${prefix}/manifest.json`, manifest],
    [`${prefix}/shared.json`, shared],
    [`${prefix}/battle-missions.json`, battleMissions],
    [`${prefix}/battle-read.json`, battleRead],
    [`${prefix}/terrain.json`, terrain],
    [`${prefix}/${terrainMatchup}`, layouts],
    [`${prefix}/${detachment}`, detachmentRead],
    [`${prefix}/navigation.json`, navigation],
    [`${prefix}/search.json`, searchIndex],
    [`${prefix}/reference-meta.json`, referenceMetadata],
    [`${prefix}/${globalReference}`, referenceShard],
    [`${prefix}/${factionReference}`, referenceShard],
    [`${prefix}/${sheetReference}`, sheet],
    [`${prefix}/${part}`, partition],
    [`${prefix}/${picker}`, pickerUnits],
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

it('shares concurrent faction builds without retaining them after the reads finish', async () => {
  const { read, manifestSha256 } = fixture()
  let partitionReads = 0
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith(`/${part}`)) partitionReads++
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  await Promise.all([store.catalogue('army'), store.catalogue('army')])
  expect(partitionReads).toBe(1)
  await store.catalogue('army')
  expect(partitionReads).toBe(2)
})

it('retries a faction build after its partition read fails', async () => {
  const { read, manifestSha256 } = fixture()
  let fail = true
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith(`/${part}`) && fail) {
        fail = false
        throw new Error('partition unavailable')
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  await expect(store.catalogue('army')).rejects.toThrow('partition unavailable')
  await expect(store.catalogue('army')).resolves.toMatchObject({ index: { revision: 'test-revision' } })
})

it('serves battle mission rules without loading shared data', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/shared.json')) throw new Error('full rules should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect(missionFor(await store.battleMissions(), 'one', 'two', 'pack')).toMatchObject({ name: 'Vital Link', fixedSecondaryCap: 20 })
})

it('rejects changed battle mission rules', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/battle-missions.json`, encode({ missions: new Map(), fixedSecondaryCaps: new Map() }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.battleMissions()).rejects.toThrow('checksum does not match')
})

it('serves battle read rules without loading the full rules', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/shared.json')) throw new Error('full rules should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.battleReadRules()).attribution).toBe('Test source')
})

it('rejects changed battle read rules', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/battle-read.json`, encode({ missions: new Map(), fixedSecondaryCaps: new Map() }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.battleReadRules()).rejects.toThrow('checksum does not match')
})

it('serves terrain without loading the full rules', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/shared.json')) throw new Error('full rules should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.terrain(['one-vs-two', 'unknown'])).terrainLayouts).toEqual([{ matchupId: 'one-vs-two' }])
})

it('rejects changed terrain layouts', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${terrainMatchup}`, encode([{ matchupId: 'other' }]))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.terrain(['one-vs-two'])).rejects.toThrow('checksum does not match')
})

it('rejects layouts assigned to the wrong matchup', async () => {
  const { read, manifestSha256 } = fixture('other')
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.terrain(['one-vs-two'])).rejects.toThrow('Invalid Worker terrain matchup layouts')
})

it('rejects a manifest missing a battle detachment asset', () => {
  const { objects, prefix } = fixture()
  const manifest = JSON.parse(new TextDecoder().decode(objects.get(`${prefix}/manifest.json`)))
  delete manifest.entries[detachment]
  expect(() => workerCatalogueManifest(manifest, snapshotId)).toThrow('Worker battle detachment data is missing')
})

it('serves selected battle detachments without loading shared rules or the faction partition', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/shared.json') || key.includes('/partitions/')) throw new Error('unrelated data should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  const data = await store.detachmentRead('army')
  expect(data && selectedBattleDetachmentData(data, [])).toMatchObject({ attribution: 'Test source', stratagems: [], written: [] })
  expect(await store.detachmentRead('other')).toBeNull()
})

it('rejects changed battle detachment data', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${detachment}`, encode({ index: { rules: new Map() } }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.detachmentRead('army')).rejects.toThrow('checksum does not match')
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

it('serves the priced roster picker without loading shared data or a faction partition', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.includes('/partitions/') || key.endsWith('/shared.json')) throw new Error('unrelated data should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.pickerUnits('army'))?.[0]?.search?.keywords).toEqual(['Infantry'])
  expect(await store.pickerUnits('other')).toBeNull()
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
  expect((await store.rosterLabelRules()).factionNames.get('army')).toBe('Test army')
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
