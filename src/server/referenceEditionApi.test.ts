import { expect, it, vi } from 'vitest'
import { shelfOf, points } from './catalogue.fixtures'
import { compileCanonicalCatalogue } from './canonicalCatalogue'
import type { CatalogueEdition } from '../core/catalogueEdition'

const { reads } = vi.hoisted(() => ({
  reads: {
    sync: () => ({ status: 'ready' }),
    catalogue: vi.fn(),
    rules: () => null,
    canonicalCatalogue: vi.fn(),
    catalogueFor: vi.fn(),
    rulesFor: async () => null,
    canonicalCatalogueFor: vi.fn(),
  },
}))
vi.mock('./app', () => ({ app: () => reads }))

import { referenceDatasheetResponse, referenceDocumentResponse, referenceFactionsResponse, referenceRecordResponse } from './referenceApi'

const loaded = shelfOf(
  {
    id: 'codex~parent',
    name: 'Marines',
    selectionEntries: [{ id: 'captain', name: 'Captain', type: 'unit', costs: points(85) }],
  },
  {
    id: 'codex~child',
    name: 'Chapter',
    selectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(100) }],
  },
)
loaded.edition = {
  id: 'codex',
  name: 'Chapter preview',
  status: 'preview',
  default: false,
  catalogueIds: ['child'],
  releases: [{ at: 1, status: 'preview' }],
} satisfies CatalogueEdition
const scoped = compileCanonicalCatalogue(loaded, { definitions: 'edition' })
const advertised = { ...scoped, datasheets: scoped.datasheets.filter((sheet) => sheet.catalogueId === 'codex~child') }
reads.catalogue.mockReturnValue(loaded)
reads.canonicalCatalogue.mockReturnValue(advertised)
reads.catalogueFor.mockImplementation(async (id: string) => (loaded.index.catalogues.has(id) ? loaded : null))
reads.canonicalCatalogueFor.mockImplementation(async (id: string) => (loaded.index.catalogues.has(id) ? scoped : null))

const request = () => new Request('https://praetorium.gg/api/reference/v1/test')

it('reads an imported support datasheet from its exact qualified reference URL', async () => {
  const response = await referenceDatasheetResponse(request(), 'codex~parent', 'captain')
  expect({ status: response.status, body: await response.json() }).toMatchObject({
    status: 200,
    body: { data: { catalogueId: 'codex~parent', name: 'Captain', points: 85 } },
  })
})

it.each([referenceDocumentResponse, referenceRecordResponse])(
  'reads qualified support records through document and structured endpoints',
  async (read) => {
    const response = await read(request(), 'datasheet:codex~parent:captain')
    expect(response.status).toBe(200)
  },
)

it('keeps support factions out of global reference discovery', async () => {
  const response = await referenceFactionsResponse(request())
  const body = await response.json()
  expect(body.factions.map((faction: { id: string }) => faction.id)).toEqual(['codex~child'])
})

it('refuses a qualified support book that is absent from the edition', async () => {
  expect((await referenceDatasheetResponse(request(), 'codex~missing', 'captain')).status).toBe(503)
})
