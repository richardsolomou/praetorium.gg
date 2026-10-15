import { beforeEach, expect, it, vi } from 'vitest'
import { importRosterInput } from './rosterImport'

const mocks = vi.hoisted(() => ({ exchange: false, catalogueFor: vi.fn() }))
vi.mock('./app', () => ({
  app: () => ({
    factionsFor: async () => ({ factions: [{ id: 'mfm~necrons-root', name: 'Necrons', isDefault: true }] }),
    factionFor: async (id: string) => (id === 'necrons-root' ? { id, name: 'Necrons' } : null),
    catalogueFor: mocks.catalogueFor,
    rulesFor: async () => null,
  }),
}))
vi.mock('../core/rosterExchange', async (actual) => ({
  ...(await actual<typeof import('../core/rosterExchange')>()),
  isRosterExchangeCode: () => mocks.exchange,
  decodeRosterExchange: async () => ({ catalogueId: 'necrons-root' }),
}))
vi.mock('../shared/rosterFiles', async (actual) => ({
  ...(await actual<typeof import('../shared/rosterFiles')>()),
  importRosterFaction: () => 'Necrons',
  importRosterCatalogueId: () => 'necrons-root',
  importRosterFile: () => 'imported',
  importRosterExchange: () => 'imported',
}))

beforeEach(() => {
  mocks.catalogueFor.mockReset().mockResolvedValue({})
})

it('imports army text naming an exact root book the faction index lists only qualified', async () => {
  mocks.exchange = false
  await importRosterInput('army text')
  expect(mocks.catalogueFor).toHaveBeenCalledWith('necrons-root')
})

it('imports an exchange code saved on an exact root book the faction index lists only qualified', async () => {
  mocks.exchange = true
  await importRosterInput('exchange code')
  expect(mocks.catalogueFor).toHaveBeenCalledWith('necrons-root')
})
