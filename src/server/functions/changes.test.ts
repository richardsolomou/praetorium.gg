import { expect, it, vi } from 'vitest'
import type { CanonicalCatalogue } from '../../contracts/catalogue'
import type { CatalogueHistoryEntry } from '../../core/catalogueHistory'
import { catalogueChangeLog, referenceChanges } from './changes'

const mocks = vi.hoisted(() => ({ canonicalCatalogueFor: vi.fn(), catalogueHistoryFor: vi.fn() }))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work() }))
vi.mock('../app', () => ({ app: () => mocks }))

const faction = 'codex~parent'
const change = { kind: 'detachment-points' as const, id: 'inherited', name: 'Inherited', from: '1', to: '2' }
const history: CatalogueHistoryEntry[] = [
  {
    from: 'previous',
    recordedAt: 2,
    revisions: {},
    changes: { factions: [{ catalogueId: faction, faction: 'Parent', changes: [change] }], omitted: 0 },
  },
]
const canonical = {
  datasheets: [],
  detachments: [{ catalogueId: faction, id: 'inherited', factionSlug: faction, slug: 'inherited' }],
} as unknown as CanonicalCatalogue

it.each(['faction', 'reference'] as const)('shows inherited edition history on its %s page', async (page) => {
  mocks.catalogueHistoryFor.mockResolvedValue(history)
  mocks.canonicalCatalogueFor.mockImplementation(async (id?: string) => (id === faction ? canonical : { datasheets: [], detachments: [] }))
  if (page === 'faction') {
    const invoke = catalogueChangeLog as unknown as (input: { data: { faction: string } }) => Promise<{ updates: { recordedAt: number }[] }>
    expect((await invoke({ data: { faction } })).updates.map((entry) => entry.recordedAt)).toEqual([2])
  } else {
    const invoke = referenceChanges as unknown as (input: {
      data: { faction: string; kind: 'detachment'; slug: string }
    }) => Promise<unknown>
    expect(await invoke({ data: { faction, kind: 'detachment', slug: 'inherited' } })).toEqual([{ recordedAt: 2, change }])
  }
})
