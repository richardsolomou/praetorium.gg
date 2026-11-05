import { expect, it, vi } from 'vitest'
import { importRoster } from '../functions'

const mocks = vi.hoisted(() => ({ exchangeFaction: vi.fn(), fileImport: vi.fn(), exchange: true }))
vi.mock('../../server/functions', () => ({ importRoster: async () => Promise.reject(new TypeError('Failed to fetch')) }))
vi.mock('./referenceStore', async () => (await import('./savedReference.fixtures')).storedPartReader)
vi.mock('./runtime', async (actual) => {
  const { savedDownload } = await import('./savedReference.fixtures')
  const saved = savedDownload([
    { key: ['faction-index'], data: { factions: [{ id: 'mfm~necrons-root', name: 'Necrons', isDefault: true }] } },
    { key: ['faction', 'necrons-root'], data: { id: 'necrons-root', name: 'Necrons' } },
    { key: ['import-translations'], data: [['Necrons', ['Necrones']]] },
  ])
  return { ...(await actual<typeof import('./runtime')>()), referenceData: () => saved }
})
vi.mock('./construction', async (actual) => ({
  ...(await actual<typeof import('./construction')>()),
  constructionRead: async (name: 'importExchange' | 'importFile', data: never) =>
    (await import('./constructionReads')).constructionReads[name]({ catalogue: {}, rules: null } as never, data),
}))
vi.mock('../../core/rosterExchange', async (actual) => ({
  ...(await actual<typeof import('../../core/rosterExchange')>()),
  isRosterExchangeCode: () => mocks.exchange,
  decodeRosterExchange: async () => ({ catalogueId: 'necrons-root' }),
}))
vi.mock('../../shared/rosterFiles', async (actual) => ({
  ...(await actual<typeof import('../../shared/rosterFiles')>()),
  importRosterExchange: (_exchange: unknown, _catalogue: unknown, _rules: unknown, name: string) => mocks.exchangeFaction(name),
  importRosterFile: (_file: unknown, catalogue: unknown, _names: unknown, _rules: unknown, translations: unknown) =>
    mocks.fileImport(catalogue, translations),
}))

it('imports an exchange code offline on an exact root book the faction index lists only qualified', async () => {
  mocks.exchange = true
  await importRoster({ data: { file: 'exchange code' } })
  expect(mocks.exchangeFaction).toHaveBeenCalledWith('Necrons')
})

it('reads army text in another language offline with the translations the download saved', async () => {
  mocks.exchange = false
  await importRoster({
    data: {
      file: 'Lista (70 puntos)\n\nNecrones\nPantheon of Woe (2 puntos de destacamento)\nFuerza de Choque (2000 puntos)\n\nTomb Blades (70 puntos)\n  • 3 Tomb Blade\n',
    },
  })
  expect(mocks.fileImport).toHaveBeenCalledWith({}, new Map([['Necrons', ['Necrones']]]))
})
