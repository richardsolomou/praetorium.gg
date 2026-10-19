import { beforeEach, expect, it, vi } from 'vitest'
import { datasheetBySlug } from './references'

const mocks = vi.hoisted(() => ({ canonicalCatalogueFor: vi.fn(), catalogueFor: vi.fn(), rulesFor: vi.fn() }))
vi.mock('@tanstack/react-start', () => {
  const builder = () => ({ validator: () => builder(), handler: (handler: unknown) => handler })
  return { createServerFn: builder }
})
vi.mock('../rpc', () => ({ rpc: (work: () => unknown) => work(), mutationRpc: (work: () => unknown) => work() }))
vi.mock('../app', () => ({ app: () => mocks }))
vi.mock('../snapshotCache', () => ({ cacheUntilSnapshotChanges: () => undefined }))
vi.mock('../snapshotMemo', () => ({ memoUntilSnapshotChanges: (_scope: string, _data: unknown, work: () => unknown) => work() }))

const invoke = datasheetBySlug as unknown as (input: { data: { catalogueId: string; slug: string } }) => Promise<unknown>
beforeEach(() => vi.resetAllMocks())

it('serves a prepared reference without loading the construction catalogue or rules', async () => {
  const sheet = { catalogueId: 'cat', slug: 'unit', name: 'Unit' }
  mocks.canonicalCatalogueFor.mockResolvedValue({ datasheets: [sheet] })
  mocks.catalogueFor.mockImplementation(() => {
    throw new Error('construction catalogue read')
  })
  mocks.rulesFor.mockImplementation(() => {
    throw new Error('construction rules read')
  })
  expect(await invoke({ data: { catalogueId: 'cat', slug: 'unit' } })).toBe(sheet)
})

it('keeps a missing prepared datasheet authoritative', async () => {
  mocks.canonicalCatalogueFor.mockResolvedValue({ datasheets: [] })
  mocks.catalogueFor.mockImplementation(() => {
    throw new Error('construction catalogue read')
  })
  expect(await invoke({ data: { catalogueId: 'cat', slug: 'missing' } })).toBeNull()
})
