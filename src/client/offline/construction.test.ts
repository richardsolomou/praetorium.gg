import { afterEach, expect, it, vi } from 'vitest'
import { system, bookOf, points } from '../../server/catalogue.fixtures'
import { packRuntimeData } from '../../contracts/runtimeData'
import { catalogueEditionSchema } from '../../core/catalogueEdition'
import type { OfflineConstructionSource } from '../../contracts/offlineReference'
import { calculateRosterAssessment } from '../../shared/pricing'
import { buildConstruction, localConstruction, constructionRead } from './construction'

const mocks = vi.hoisted(() => ({ reference: vi.fn() }))
vi.mock('./runtime', () => ({ referenceData: mocks.reference }))
afterEach(() => vi.unstubAllGlobals())

function source(cost: number, versioned = false): OfflineConstructionSource {
  const loaded = bookOf({ selectionEntries: [{ id: 'unit', name: 'Unit', type: 'model', costs: points(cost) }] })
  const rules = { factionKeys: new Map(), detachmentReferences: new Map(), detachmentDetails: new Map(), factionRestrictions: new Map() }
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

it('refuses unavailable codexes offline instead of reading base rules or requesting the server', async () => {
  mocks.reference.mockReturnValue({ construction: source(80) })
  vi.stubGlobal('window', {})
  vi.stubGlobal('navigator', { onLine: false })
  const online = vi.fn()
  await expect(constructionRead(() => 'base', online, 'missing~cat')).rejects.toThrow('Download this army')
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
  expect(await constructionRead(() => 'local', online)).toBe('server')
})
