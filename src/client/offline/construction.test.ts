import { afterEach, expect, it, vi } from 'vitest'
import { system, bookOf, points, card, withCards } from '../../server/catalogue.fixtures'
import { packRuntimeData } from '../../contracts/runtimeData'
import { catalogueEditionSchema } from '../../core/catalogueEdition'
import type { OfflineConstructionSource } from '../../contracts/offlineReference'
import { calculateRosterAssessment } from '../../shared/pricing'
import { localConstruction, constructionRead } from './construction'
import { buildConstruction } from './constructionSource'
import { datacardOf } from '../../shared/datasheetJoin'
import { shareRuntimeData } from '../../contracts/sharedRuntimeData'
import type { RuntimeData } from '../../contracts/runtimeData'
import type { TerrainLayout, TerrainTemplate } from '../../contracts/terrain'
import { TERRAIN_GEOMETRY_VERSION } from '../../contracts/terrainReference'

const mocks = vi.hoisted(() => ({ reference: vi.fn(), device: vi.fn() }))
vi.mock('./runtime', () => ({ referenceData: mocks.reference }))
vi.mock('./constructionWorker', () => ({ deviceConstructionRead: mocks.device }))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  mocks.device.mockReset()
})

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

it('uses the selected codex prices and legality without changing the base catalogue', () => {
  mocks.reference.mockReturnValue({ construction: { ...source(80), editions: [source(1001, true)] } })
  const selected = localConstruction('codex~cat')!
  const assessed = calculateRosterAssessment(
    { catalogueId: 'codex~cat', detachmentIds: [], disposition: null, units: [{ entryId: 'unit' }], limit: 1000 },
    selected.catalogue,
    selected.rules,
  )
  expect({ points: assessed?.points, edition: selected.catalogue.edition?.id, base: localConstruction('cat')?.revision }).toEqual({
    points: 1001,
    edition: 'codex',
    base: 'base-revision',
  })
})

it('reuses a selected source and replaces it after a reference refresh', () => {
  const saved = source(80, true)
  mocks.reference.mockReturnValue({ construction: { ...source(80), editions: [saved] } })
  const first = localConstruction('codex~cat')
  expect(localConstruction('codex~cat')).toBe(first)
  mocks.reference.mockReturnValue({ construction: { ...source(80), editions: [source(90, true)] } })
  expect(localConstruction('codex~cat')).not.toBe(first)
})

it('restores battle terrain from shared reference queries without duplicating layouts', () => {
  const layout: TerrainLayout = {
    id: 'layout-a',
    name: 'Layout A',
    description: null,
    matchupId: 'purge-vs-purge',
    variant: 1,
    deploymentId: 'search-and-destroy',
    pieces: [],
    geometry: { board: { width: 60, height: 44 }, areas: [] },
  }
  const template: TerrainTemplate = { id: 'ruin', name: 'Ruin', kind: 'ruin', points: [{ x: 0, y: 0 }], features: [] }
  const terrain = { layouts: [layout], templates: [template] }
  mocks.reference.mockReturnValue({
    construction: source(80),
    queries: [
      { key: ['terrain-references', TERRAIN_GEOMETRY_VERSION, 'purge-vs-purge'], data: terrain },
      { key: ['terrain-references', TERRAIN_GEOMETRY_VERSION, 'purge-vs-other'], data: terrain },
    ],
  })
  const { terrainLayouts, terrainTemplates } = localConstruction()!.rules
  expect({ terrainLayouts, terrainTemplates }).toEqual({ terrainLayouts: [layout], terrainTemplates: [template] })
})

it('does not restore terrain from unrelated queries or an incompatible geometry version', () => {
  mocks.reference.mockReturnValue({
    construction: source(80),
    queries: [
      { key: ['terrain-references', TERRAIN_GEOMETRY_VERSION - 1], data: { layouts: [{ id: 'old-layout' }], templates: [] } },
      { key: ['unrelated', TERRAIN_GEOMETRY_VERSION], data: { layouts: [{ id: 'unrelated-layout' }], templates: [] } },
    ],
  })
  expect(localConstruction()!.rules.terrainLayouts).toEqual([])
})

it('keeps construction terrain from older downloads without shared terrain queries', () => {
  const saved = source(80)
  const layouts = [{ id: 'legacy-layout', geometry: { board: { width: 60, height: 44 }, areas: [] } }]
  saved.rules = { ...(saved.rules as object), terrainLayouts: packRuntimeData(layouts) }
  mocks.reference.mockReturnValue({ construction: saved, queries: [] })
  expect(localConstruction()!.rules.terrainLayouts).toEqual(layouts)
})

it('reconstructs a named base edition offline with stable caching and current prices', () => {
  const edition = source(80, true).edition!
  mocks.reference.mockReturnValue({ construction: { ...source(80), editions: [{ base: true, version: 1, revision: 'current', edition }] } })
  const selected = localConstruction('codex~cat')!
  expect({
    points: calculateRosterAssessment(
      { catalogueId: 'codex~cat', detachmentIds: [], disposition: null, units: [{ entryId: 'unit' }], limit: 1000 },
      selected.catalogue,
      selected.rules,
    )?.points,
    revision: selected.revision,
    edition: selected.catalogue.edition?.id,
    cached: localConstruction('codex~cat') === selected,
  }).toEqual({ points: 80, revision: 'current', edition: 'codex', cached: true })
})

it('reconstructs shared archived construction only when selected and keeps its own prices', () => {
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
  }
  mocks.reference.mockReturnValue({ construction: { ...base, shared: true, editions: [shared] } })
  const selected = localConstruction('codex~cat')!
  expect({
    points: calculateRosterAssessment(
      { catalogueId: 'codex~cat', detachmentIds: [], disposition: null, units: [{ entryId: 'unit' }], limit: 1000 },
      selected.catalogue,
      selected.rules,
    )?.points,
    cached: localConstruction('codex~cat') === selected,
    base: localConstruction('cat')?.revision,
  }).toEqual({ points: 1001, cached: true, base: 'base-revision' })
})

it('refuses a shared source whose base reference is missing', () => {
  const archived = { ...source(80, true), datacards: { $praetoriumBase: ['missing'] } }
  mocks.reference.mockReturnValue({ construction: { ...source(80), shared: true, editions: [archived] } })
  expect(() => localConstruction('codex~cat')).toThrow('Missing shared runtime data')
})

it('restores retained construction prose on demand from the saved text pool', () => {
  const description = 'Historical rules prose.'
  const base = source(80)
  base.rules = { ...(base.rules as object), abilityDescriptions: packRuntimeData(new Map([['unit', { $praetoriumText: 0 }]])) }
  const edition = source(80, true).edition!
  mocks.reference.mockReturnValue({
    construction: { ...base, texts: [description], editions: [{ base: true, version: 1, revision: 'current', edition }] },
  })
  expect({
    base: localConstruction('cat')!.rules.abilityDescriptions.get('unit'),
    named: localConstruction('codex~cat')!.rules.abilityDescriptions.get('unit'),
  }).toEqual({ base: description, named: description })
})

it('refuses unavailable codexes offline instead of reading base rules or requesting the server', async () => {
  mocks.reference.mockReturnValue({ construction: source(80) })
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

const wounds = (online: () => Promise<unknown>, signal?: AbortSignal) =>
  constructionRead('unitWounds', { catalogueId: 'cat', entryIds: [] }, online, 'cat', signal)

it('answers from the device without asking the server once the device has prepared the read', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.device.mockReturnValue(Promise.resolve('device'))
  const online = vi.fn()
  expect({ answer: await wounds(online), asked: online.mock.calls.length }).toEqual({ answer: 'device', asked: 0 })
})

it('asks only the server while the device has not prepared the read', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.device.mockReturnValue(null)
  expect(await wounds(() => Promise.resolve('server'))).toBe('server')
})

it('asks the server when the device fails to answer', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.device.mockReturnValue(Promise.reject(new Error('worker failed')))
  expect(await wounds(() => Promise.resolve('server'))).toBe('server')
})

it('stops waiting for the device when the read is cancelled', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.device.mockReturnValue(new Promise(() => {}))
  const controller = new AbortController()
  const answer = wounds(vi.fn(), controller.signal)
  controller.abort(new Error('left the page'))
  await expect(answer).rejects.toThrow('left the page')
})

it('does not ask the server for a cancelled read the device failed', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  const controller = new AbortController()
  mocks.device.mockReturnValue(Promise.reject(new Error('worker failed')))
  controller.abort(new Error('left the page'))
  const online = vi.fn()
  await expect(wounds(online, controller.signal)).rejects.toThrow('left the page')
  expect(online).not.toHaveBeenCalled()
})

it('keeps exports on the server, which records them, while the device could answer', async () => {
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: true })
  mocks.device.mockReturnValue(Promise.resolve('device'))
  const online = vi.fn().mockResolvedValue('server')
  expect(await constructionRead('exportRoster', {} as never, online, 'cat')).toBe('server')
})
