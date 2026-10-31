import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { system, bookOf, points, card, withCards } from '../../server/catalogue.fixtures'
import { packRuntimeData } from '../../contracts/runtimeData'
import { catalogueEditionSchema } from '../../core/catalogueEdition'
import type { OfflineConstructionBase, OfflineConstructionSource } from '../../contracts/offlineReference'
import { calculateRosterAssessment } from '../../shared/pricing'
import { battleRules, constructionRead, loadLocalRules, localConstruction } from './construction'
import { buildConstruction } from './constructionSource'
import { datacardOf } from '../../shared/datasheetJoin'
import { shareRuntimeData } from '../../contracts/sharedRuntimeData'
import type { RuntimeData } from '../../contracts/runtimeData'
import type { TerrainLayout } from '../../contracts/terrain'
import { TERRAIN_GEOMETRY_VERSION } from '../../contracts/terrainReference'
import type { BattleState } from '../../core/battle'

const mocks = vi.hoisted(() => ({ reference: vi.fn(), device: vi.fn(), query: vi.fn(), parts: new Map<string, unknown>(), read: vi.fn() }))
vi.mock('./runtime', () => ({
  referenceData: mocks.reference,
  loadSavedQuery: mocks.query,
  partsReachable: () => false,
  subscribeReference: () => () => {},
}))
vi.mock('./referenceStore', () => ({ readPart: mocks.read }))
vi.mock('./constructionWorker', () => ({ deviceConstructionRead: mocks.device }))
beforeEach(() => {
  mocks.read.mockImplementation(async (asset: string) => {
    if (!mocks.parts.has(asset)) throw new Error('This part of the download is unavailable')
    return structuredClone(mocks.parts.get(asset))
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  mocks.device.mockReset()
  mocks.read.mockReset()
})

let downloads = 0
/** Saves construction data as a download publishes it: the current rules' catalogue and rules apart, other versions on their own. */
function saveDownload(base: OfflineConstructionSource, editions: (OfflineConstructionSource | OfflineConstructionBase)[] = []) {
  const { rules, ...catalogue } = base
  const revision = `download-${++downloads}`
  mocks.parts.clear()
  mocks.parts.set(`/${revision}/catalogue`, { ...catalogue, editions: editions.filter((edition) => 'base' in edition) })
  mocks.parts.set(`/${revision}/rules`, { revision: base.revision, rules })
  const named: Record<string, string> = {}
  for (const edition of editions)
    if (!('base' in edition)) mocks.parts.set((named[edition.edition!.id] = `/${revision}/${edition.edition!.id}`), edition)
  mocks.reference.mockReturnValue({
    download: { revision, construction: { catalogue: `/${revision}/catalogue`, rules: `/${revision}/rules`, editions: named } },
    editions: Object.keys(named),
  })
}

function source(cost: number, versioned = false): OfflineConstructionSource {
  const loaded = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(cost) }] })
  const rules = {
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map(),
    factionRestrictions: new Map(),
    terrainLayouts: [],
    terrainTemplates: [],
  }
  return {
    version: 1,
    revision: versioned ? 'codex-revision' : 'base-revision',
    files: [
      system,
      {
        catalogue: {
          id: 'cat',
          name: 'Test catalogue',
          selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(cost) }],
        },
      },
    ],
    datacards: packRuntimeData(loaded.datacards),
    mfm: packRuntimeData(null),
    rules: packRuntimeData(rules),
    ...(versioned
      ? {
          edition: catalogueEditionSchema.parse({
            id: 'codex',
            name: 'Codex',
            status: 'preview',
            catalogueIds: ['cat'],
            releases: [{ at: 1, status: 'preview' }],
          }),
        }
      : {}),
  }
}

it('keeps archived profile authority after a versioned offline reconstruction', () => {
  const saved = source(80, true)
  const loaded = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model' }] })
  loaded.datacards.factions.set(
    'test-catalogue',
    withCards(
      'Test catalogue',
      new Map([['Unit', card({ points: [{ models: '1', cost: '90', keyword: null, faction: null, detachment: null }] })]]),
    ),
  )
  saved.datacards = packRuntimeData(loaded.datacards)
  saved.datacardExcludedCatalogueIds = ['cat']
  const archived = buildConstruction(saved)
  const ordinary = buildConstruction({ ...saved, datacardExcludedCatalogueIds: undefined })
  expect({
    archived: datacardOf(archived.catalogue, 'codex~cat', 'unit'),
    ordinary: datacardOf(ordinary.catalogue, 'codex~cat', 'unit') !== null,
  }).toEqual({ archived: null, ordinary: true })
})

const assessedPoints = (selected: NonNullable<Awaited<ReturnType<typeof localConstruction>>>) =>
  calculateRosterAssessment(
    { catalogueId: 'codex~cat', detachmentIds: [], disposition: null, units: [{ entryId: 'unit' }], limit: 1000 },
    selected.catalogue,
    selected.rules,
  )?.points

it('uses the selected codex prices and legality without changing the base catalogue', async () => {
  saveDownload(source(80), [source(1001, true)])
  const selected = (await localConstruction('codex~cat'))!
  expect({
    points: assessedPoints(selected),
    edition: selected.catalogue.edition?.id,
    base: (await localConstruction('cat'))?.revision,
  }).toEqual({
    points: 1001,
    edition: 'codex',
    base: 'base-revision',
  })
})

it('reuses a selected source and replaces it after a reference refresh', async () => {
  saveDownload(source(80), [source(80, true)])
  const first = await localConstruction('codex~cat')
  expect(await localConstruction('codex~cat')).toBe(first)
  saveDownload(source(80), [source(90, true)])
  expect(await localConstruction('codex~cat')).not.toBe(first)
})

it('reconstructs a named base edition offline with stable caching and current prices', async () => {
  const edition = source(80, true).edition!
  saveDownload(source(80), [{ base: true, version: 1, revision: 'current', edition }])
  const selected = (await localConstruction('codex~cat'))!
  expect({
    points: assessedPoints(selected),
    revision: selected.revision,
    edition: selected.catalogue.edition?.id,
    cached: (await localConstruction('codex~cat')) === selected,
  }).toEqual({ points: 80, revision: 'current', edition: 'codex', cached: true })
})

it('reconstructs shared archived construction only when selected and keeps its own prices', async () => {
  const base = source(80)
  const archived = source(1001, true)
  const shared = {
    ...archived,
    files: archived.files.map((file, index) =>
      shareRuntimeData(file as unknown as RuntimeData, base.files[index] as unknown as RuntimeData, [String(index)]),
    ),
    datacards: shareRuntimeData(archived.datacards, base.datacards),
    mfm: shareRuntimeData(archived.mfm, base.mfm),
    rules: shareRuntimeData(archived.rules, base.rules),
  } as OfflineConstructionSource
  saveDownload(base, [shared])
  expect((await localConstruction('cat'))?.revision).toBe('base-revision')
  expect(mocks.read.mock.calls.map(([asset]) => asset)).not.toContain(mocks.reference().download.construction.editions.codex)
  const selected = (await localConstruction('codex~cat'))!
  expect({ points: assessedPoints(selected), cached: (await localConstruction('codex~cat')) === selected }).toEqual({
    points: 1001,
    cached: true,
  })
})

it('builds nothing from a shared source whose base reference is missing', async () => {
  saveDownload(source(80), [{ ...source(80, true), datacards: { $praetoriumBase: ['missing'] } }])
  expect(await localConstruction('codex~cat')).toBeNull()
})

it('validates battles with the rules part alone and the terrain of their own matchup', async () => {
  saveDownload(source(80))
  const layout = { id: 'layout-a', matchupId: 'purge-vs-take' } as TerrainLayout
  mocks.query.mockResolvedValue({ layouts: [layout], templates: [] })
  const state = {
    players: [
      { id: 'one', side: 0, roster: { built: { disposition: 'purge' } } },
      { id: 'two', side: 1, roster: { built: { disposition: 'take' } } },
    ],
    sideDispositions: {},
    status: 'playing',
  } as unknown as BattleState
  const loaded = await battleRules(state)
  expect({
    read: mocks.read.mock.calls.map(([asset]) => asset),
    terrain: mocks.query.mock.calls[0]?.[1],
    layouts: loaded?.rules.terrainLayouts,
    revision: loaded?.revision,
  }).toEqual({
    read: [mocks.reference().download.construction.rules],
    terrain: ['terrain-references', TERRAIN_GEOMETRY_VERSION, 'purge-vs-take', 'take-vs-purge'],
    layouts: [layout],
    revision: 'base-revision',
  })
})

it('reads the battle rules again after a failed read instead of refusing every later command', async () => {
  saveDownload(source(80))
  const rules = mocks.reference().download.construction.rules
  const saved = mocks.parts.get(rules)
  mocks.parts.delete(rules)
  expect(await loadLocalRules()).toBeNull()
  mocks.parts.set(rules, saved)
  expect((await loadLocalRules())?.revision).toBe('base-revision')
})

it('refuses unavailable codexes offline instead of reading base rules or requesting the server', async () => {
  saveDownload(source(80))
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  const online = vi.fn()
  await expect(constructionRead('unitWounds', { catalogueId: 'missing~cat', entryIds: [] }, online, 'missing~cat')).rejects.toThrow(
    'Download this army',
  )
  expect(online).not.toHaveBeenCalled()
})

it('namespaces the catalogue used to discover detachments', () => {
  const saved = source(80, true)
  saved.files[1]!.catalogue!.sharedSelectionEntries = [
    {
      id: 'wrapper',
      name: 'Detachments',
      type: 'upgrade',
      selectionEntryGroups: [{ id: 'options', selectionEntries: [{ id: 'detachment-choice', name: 'Test detachment', type: 'upgrade' }] }],
    },
  ]
  const selected = buildConstruction(saved)
  expect(selected.catalogue.detachments.get('codex~cat')?.options.map((option) => option.id)).toEqual(['detachment-choice'])
})

it('uses connected reads when the server navigator has no connectivity property', async () => {
  mocks.reference.mockReturnValue(undefined)
  vi.stubGlobal('navigator', { userAgent: 'Node.js' })
  const online = vi.fn().mockResolvedValue('server')
  expect(await constructionRead('unitWounds', { catalogueId: 'cat', entryIds: [] }, online)).toBe('server')
})

function connect() {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
}
const wounds = (online: () => Promise<unknown>, signal?: AbortSignal) =>
  constructionRead('unitWounds', { catalogueId: 'cat', entryIds: [] }, online, 'cat', signal)

it('answers from the device without asking the server once the device has prepared the read', async () => {
  connect()
  mocks.device.mockReturnValue(Promise.resolve('device'))
  const online = vi.fn()
  expect({ answer: await wounds(online), asked: online.mock.calls.length }).toEqual({ answer: 'device', asked: 0 })
})

it('asks only the server while the device has not prepared the read', async () => {
  connect()
  mocks.device.mockReturnValue(null)
  expect(await wounds(() => Promise.resolve('server'))).toBe('server')
})

it('asks the server when the device fails to answer', async () => {
  connect()
  mocks.device.mockReturnValue(Promise.reject(new Error('worker failed')))
  expect(await wounds(() => Promise.resolve('server'))).toBe('server')
})

it('stops waiting for the device when the read is cancelled', async () => {
  connect()
  mocks.device.mockReturnValue(new Promise(() => {}))
  const controller = new AbortController()
  const answer = wounds(vi.fn(), controller.signal)
  controller.abort(new Error('left the page'))
  await expect(answer).rejects.toThrow('left the page')
})

it('does not ask the server for a cancelled read the device failed', async () => {
  connect()
  const controller = new AbortController()
  mocks.device.mockReturnValue(Promise.reject(new Error('worker failed')))
  controller.abort(new Error('left the page'))
  const online = vi.fn()
  await expect(wounds(online, controller.signal)).rejects.toThrow('left the page')
  expect(online).not.toHaveBeenCalled()
})

it('keeps exports on the server, which records them, while the device could answer', async () => {
  connect()
  mocks.device.mockReturnValue(Promise.resolve('device'))
  const online = vi.fn().mockResolvedValue('server')
  expect(await constructionRead('exportRoster', {} as never, online, 'cat')).toBe('server')
})
