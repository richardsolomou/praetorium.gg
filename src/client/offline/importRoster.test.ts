import { expect, it, vi } from 'vitest'
import { importRoster } from '../functions'

const mocks = vi.hoisted(() => ({ exchangeFaction: vi.fn() }))
vi.mock('../../server/functions', () => ({ importRoster: async () => Promise.reject(new TypeError('Failed to fetch')) }))
vi.mock('./referenceStore', async () => (await import('./savedReference.fixtures')).storedPartReader)
vi.mock('./runtime', async (actual) => {
  const { savedDownload } = await import('./savedReference.fixtures')
  const saved = savedDownload([
    { key: ['faction-index'], data: { factions: [{ id: 'mfm~necrons-root', name: 'Necrons', isDefault: true }] } },
    { key: ['faction', 'necrons-root'], data: { id: 'necrons-root', name: 'Necrons' } },
  ])
  return { ...(await actual<typeof import('./runtime')>()), referenceData: () => saved }
})
vi.mock('./construction', async (actual) => ({
  ...(await actual<typeof import('./construction')>()),
  constructionRead: async (name: 'importExchange', data: never) =>
    (await import('./constructionReads')).constructionReads[name]({ catalogue: {}, rules: null } as never, data),
}))
vi.mock('../../core/rosterExchange', async (actual) => ({
  ...(await actual<typeof import('../../core/rosterExchange')>()),
  isRosterExchangeCode: () => true,
  decodeRosterExchange: async () => ({ catalogueId: 'necrons-root' }),
}))
vi.mock('../../shared/rosterFiles', async (actual) => ({
  ...(await actual<typeof import('../../shared/rosterFiles')>()),
  importRosterExchange: (_exchange: unknown, _catalogue: unknown, _rules: unknown, name: string) => mocks.exchangeFaction(name),
}))

it('imports an exchange code offline on an exact root book the faction index lists only qualified', async () => {
  await importRoster({ data: { file: 'exchange code' } })
  expect(mocks.exchangeFaction).toHaveBeenCalledWith('Necrons')
})
