import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { clearGlobalSingleton } from 'ras-stack/server'
import { beforeEach, expect, it } from 'vitest'
import { encodeCatalogueArtifact } from './catalogueArtifactCodec'
import { emptyExternalReferences } from './externalReferences'
import { missionFor } from './rules'
import { WorkerCatalogueStore, workerCatalogueManifest } from './workerCatalogueStore'
import { selectedBattleDetachmentData } from './battleDetachmentData'

const snapshotId = 'a'.repeat(64)
const partitions = 'partitions.bin'
const references = 'references.bin'
const auxiliary = 'auxiliary.bin'
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

function fixture(layoutMatchupId = 'one-vs-two', expandedDelta = 0) {
  const sources = encode({
    datacards: { factions: new Map() },
    sourceReferences: emptyExternalReferences(),
  })
  const rules = encode({ byDetachment: new Map() })
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
  const system = { gameSystem: { id: 'system', name: 'Test system', costTypes: [{ id: 'points', name: 'pts' }] } }
  const army = encode([
    system,
    { catalogue: { id: 'army', name: 'Test army', selectionEntries: [{ id: 'unit', name: 'Unit', type: 'unit' }] } },
  ])
  const other = encode([
    system,
    { catalogue: { id: 'other', name: 'Other army', selectionEntries: [{ id: 'other-unit', name: 'Other unit', type: 'unit' }] } },
  ])
  const armyCompressed = gzipSync(new Uint8Array(army))
  const otherCompressed = gzipSync(new Uint8Array(other))
  const bundle = Uint8Array.from(Buffer.concat([armyCompressed, otherCompressed])).buffer
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
  const auxiliaryEntries: [string, ArrayBuffer][] = [
    ['battle-missions.json', battleMissions],
    ['battle-read.json', battleRead],
    ['terrain.json', terrain],
    [terrainMatchup, layouts],
    [detachment, detachmentRead],
    [picker, pickerUnits],
  ]
  const auxiliaryRanges: Record<string, { offset: number; bytes: number; expandedBytes: number }> = {}
  const auxiliaryCompressed: Buffer[] = []
  let auxiliaryOffset = 0
  for (const [name, value] of auxiliaryEntries) {
    const compressed = gzipSync(new Uint8Array(value))
    auxiliaryRanges[name] = { offset: auxiliaryOffset, bytes: compressed.length, expandedBytes: value.byteLength }
    auxiliaryCompressed.push(compressed)
    auxiliaryOffset += compressed.length
  }
  const auxiliaryBundle = Uint8Array.from(Buffer.concat(auxiliaryCompressed)).buffer
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
  const globalCompressed = gzipSync(new Uint8Array(referenceShard))
  const factionCompressed = gzipSync(new Uint8Array(referenceShard))
  const sheetCompressed = gzipSync(new Uint8Array(sheet))
  const referenceBundle = Uint8Array.from(Buffer.concat([globalCompressed, factionCompressed, sheetCompressed])).buffer
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
    format: 'praetorium.worker-catalogue.v3',
    snapshotId,
    revision: 'test-revision',
    entries: {
      'sources.json': { sha256: sha256(sources), bytes: sources.byteLength },
      'rules.json': { sha256: sha256(rules), bytes: rules.byteLength },
      'navigation.json': { sha256: sha256(navigation), bytes: navigation.byteLength },
      'search.json': { sha256: sha256(searchIndex), bytes: searchIndex.byteLength },
      'reference-meta.json': { sha256: sha256(referenceMetadata), bytes: referenceMetadata.byteLength },
      [references]: { sha256: sha256(referenceBundle), bytes: referenceBundle.byteLength },
      [partitions]: { sha256: sha256(bundle), bytes: bundle.byteLength },
      [auxiliary]: { sha256: sha256(auxiliaryBundle), bytes: auxiliaryBundle.byteLength },
    },
    partitions: {
      army: { offset: 0, bytes: armyCompressed.length, expandedBytes: army.byteLength + expandedDelta },
      other: { offset: armyCompressed.length, bytes: otherCompressed.length, expandedBytes: other.byteLength },
    },
    referenceRanges: {
      [globalReference]: { offset: 0, bytes: globalCompressed.length, expandedBytes: referenceShard.byteLength },
      [factionReference]: { offset: globalCompressed.length, bytes: factionCompressed.length, expandedBytes: referenceShard.byteLength },
      [sheetReference]: {
        offset: globalCompressed.length + factionCompressed.length,
        bytes: sheetCompressed.length,
        expandedBytes: sheet.byteLength,
      },
    },
    auxiliaryRanges,
    detachments: { army: detachment, other: detachment },
    pickers: { army: picker, other: picker },
    terrainMatchups: { 'one-vs-two': terrainMatchup },
  })
  const manifestSha256 = sha256(manifest)
  const prefix = `snapshots/${snapshotId}/${manifestSha256}`
  const objects = new Map([
    [`${prefix}/manifest.json`, manifest],
    [`${prefix}/sources.json`, sources],
    [`${prefix}/rules.json`, rules],
    [`${prefix}/navigation.json`, navigation],
    [`${prefix}/search.json`, searchIndex],
    [`${prefix}/reference-meta.json`, referenceMetadata],
    [`${prefix}/${references}`, referenceBundle],
    [`${prefix}/${partitions}`, bundle],
    [`${prefix}/${auxiliary}`, auxiliaryBundle],
  ])
  const read = async (key: string, maxBytes: number) => {
    const bytes = objects.get(key)
    if (!bytes || bytes.byteLength > maxBytes) throw new Error('Catalogue object unavailable')
    return bytes
  }
  return { objects, read, manifestSha256, prefix }
}

it('loads verified faction partitions with shared maps', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  expect((await store.catalogue('army'))?.index.definitions.has('unit')).toBe(true)
  expect((await store.shared()).rules.byDetachment).toBeInstanceOf(Map)
  expect((await store.referenceMetadata()).revision).toBe('b'.repeat(64))
  expect((await store.catalogue('other'))?.index.definitions.has('other-unit')).toBe(true)
})

it('reuses resident compressed partitions across factions and later requests', async () => {
  const { read, manifestSha256 } = fixture()
  let bundleReads = 0
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith(`/${partitions}`)) bundleReads++
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  const [army, other] = await Promise.all([store.catalogue('army'), store.catalogue('other')])
  const later = new WorkerCatalogueStore(
    async () => {
      throw new Error('unexpected asset read')
    },
    snapshotId,
    manifestSha256,
  )
  const laterArmy = await later.catalogue('army')
  expect({
    separateIndexes: army !== other && army !== laterArmy,
    bundleReads,
    otherUnitInArmy: army?.index.definitions.has('other-unit'),
  }).toEqual({
    separateIndexes: true,
    bundleReads: 1,
    otherUnitInArmy: false,
  })
})

it('serves all catalogue data from memory after warm-up', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await store.preload()
  const later = new WorkerCatalogueStore(
    async () => {
      throw new Error('unexpected asset read')
    },
    snapshotId,
    manifestSha256,
  )
  expect({
    unit: (await later.catalogue('other'))?.index.definitions.has('other-unit'),
    rules: (await later.shared()).rules.byDetachment instanceof Map,
    reference: (await later.referenceDatasheet('army', 'unit'))?.name,
    factionReference: (await later.referenceForFaction('army'))?.catalogue.datasheets[0]?.name,
    picker: (await later.pickerUnits('army'))?.[0]?.name,
    detachment: (await later.detachmentRead('army'))?.attribution,
    terrain: (await later.terrain(['one-vs-two'])).terrainLayouts.length,
    mission: missionFor(await later.battleMissions(), 'one', 'two', 'pack')?.name,
    battleRead: (await later.battleReadRules()).attribution,
  }).toEqual({
    unit: true,
    rules: true,
    reference: 'Unit',
    factionReference: 'Unit',
    picker: 'Unit',
    detachment: 'Test source',
    terrain: 1,
    mission: 'Vital Link',
    battleRead: 'Test source',
  })
})

it('lets one cold request load the bundle for concurrent requests', async () => {
  const { read, manifestSha256 } = fixture()
  let release!: () => void
  let started!: () => void
  const reading = new Promise<void>((resolve) => {
    started = resolve
  })
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  const first = new WorkerCatalogueStore(
    async (key, maxBytes) => {
      if (key.endsWith(`/${partitions}`)) {
        started()
        await held
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  const loading = first.preload()
  await reading
  let secondReads = 0
  const second = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith(`/${partitions}`) || key.endsWith(`/${references}`)) secondReads++
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  const waiting = second.preload()
  release()
  await Promise.all([loading, waiting])
  expect(secondReads).toBe(0)
})

it('retries a bundle read failure', async () => {
  const { read, manifestSha256 } = fixture()
  let fail = true
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith(`/${partitions}`) && fail) {
        fail = false
        throw new Error('bundle unavailable')
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  await expect(store.catalogue('army')).rejects.toThrow('bundle unavailable')
  await expect(store.catalogue('army')).resolves.toMatchObject({ index: { revision: 'test-revision' } })
})

it('serves battle mission rules without loading shared data', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/sources.json') || key.endsWith('/rules.json')) throw new Error('full rules should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect(missionFor(await store.battleMissions(), 'one', 'two', 'pack')).toMatchObject({ name: 'Vital Link', fixedSecondaryCap: 20 })
})

it('rejects changed battle mission rules', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${auxiliary}`, encode({ missions: new Map(), fixedSecondaryCaps: new Map() }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.battleMissions()).rejects.toThrow('checksum does not match')
})

it('serves battle read rules without loading the full rules', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/sources.json') || key.endsWith('/rules.json')) throw new Error('full rules should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.battleReadRules()).attribution).toBe('Test source')
})

it('rejects changed battle read rules', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${auxiliary}`, encode({ missions: new Map(), fixedSecondaryCaps: new Map() }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.battleReadRules()).rejects.toThrow('checksum does not match')
})

it('serves terrain without loading the full rules', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/sources.json') || key.endsWith('/rules.json')) throw new Error('full rules should not be read')
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.terrain(['one-vs-two', 'unknown'])).terrainLayouts).toEqual([{ matchupId: 'one-vs-two' }])
})

it('rejects changed terrain layouts', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${auxiliary}`, encode([{ matchupId: 'other' }]))
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
  manifest.detachments.army = 'detachments/ffffffffffffffffffffffff.json'
  expect(() => workerCatalogueManifest(manifest, snapshotId)).toThrow('Worker battle detachment data is missing')
})

it('rejects overlapping partition ranges', () => {
  const { objects, prefix } = fixture()
  const manifest = JSON.parse(new TextDecoder().decode(objects.get(`${prefix}/manifest.json`)))
  manifest.partitions.other.offset = 0
  expect(() => workerCatalogueManifest(manifest, snapshotId)).toThrow('Invalid Worker catalogue partition range')
})

it('serves selected battle detachments without loading the complete catalogue', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/sources.json') || key.endsWith('/rules.json') || key.endsWith('/partitions.bin')) {
        throw new Error('unrelated data should not be read')
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  const data = await store.detachmentRead('army')
  expect(data && selectedBattleDetachmentData(data, [])).toMatchObject({ attribution: 'Test source', stratagems: [], written: [] })
  expect(await store.detachmentRead('unknown')).toBeNull()
})

it('rejects changed battle detachment data', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${auxiliary}`, encode({ index: { rules: new Map() } }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.detachmentRead('army')).rejects.toThrow('checksum does not match')
})

it('serves the priced roster picker without loading shared data or partitions', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/partitions.bin') || key.endsWith('/sources.json') || key.endsWith('/rules.json')) {
        throw new Error('unrelated data should not be read')
      }
      return read(key, maxBytes)
    },
    snapshotId,
    manifestSha256,
  )
  expect((await store.pickerUnits('army'))?.[0]?.search?.keywords).toEqual(['Infantry'])
  expect(await store.pickerUnits('unknown')).toBeNull()
})

it('serves the initial faction list from eager shared data', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (key.endsWith('/partitions.bin') || key.endsWith('/sources.json') || key.endsWith('/rules.json')) {
        throw new Error('unrelated data should not be read')
      }
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

it('serves a reference datasheet without loading partitions', async () => {
  const { read, manifestSha256 } = fixture()
  const store = new WorkerCatalogueStore(
    (key, maxBytes) => {
      if (
        key.endsWith('/partitions.bin') ||
        key.endsWith('/sources.json') ||
        key.endsWith('/rules.json') ||
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

it('rejects a changed reference bundle', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${references}`, encode({ catalogueId: 'army', slug: 'unit', name: 'Fake' }))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.referenceDatasheet('army', 'unit')).rejects.toThrow('checksum does not match')
})

it('refuses a changed partition bundle before building an index', async () => {
  const { objects, read, manifestSha256, prefix } = fixture()
  objects.set(`${prefix}/${partitions}`, encode([{ catalogue: { id: 'other', name: 'Other' } }]))
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.catalogue('army')).rejects.toThrow('checksum does not match')
})

it('refuses a partition whose expanded size differs from the verified manifest', async () => {
  const { read, manifestSha256 } = fixture('one-vs-two', 1)
  const store = new WorkerCatalogueStore(read, snapshotId, manifestSha256)
  await expect(store.catalogue('army')).rejects.toThrow('partition size does not match')
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
      if (key.endsWith('/sources.json') && unavailable) throw new Error('Asset unavailable')
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
