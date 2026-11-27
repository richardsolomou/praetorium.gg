import { expect, it, vi } from 'vitest'
import { vsRosterData } from '../shared/vsDataLegality'
import { app } from './app'
import { bookOf } from './catalogue.fixtures'
import { rosterSummary } from './rosterTools'

vi.mock('./app', () => ({ app: vi.fn() }))

const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
// Wraithguard as VS Data fields them: each carries a wraithcannon, which an option swaps for a D-scythe.
const book = {
  ...bookOf({ selectionEntries: [{ id: 'wraithguard', name: 'Wraithguard', type: 'unit' }] }),
  vsRoster: vsRosterData(
    {
      release: 'test',
      rulesVersion: { edition: '11th', update: 'test' },
      unavailable: [],
      points: [],
      definitions: {
        faction: { host: record('Host', {}) },
        unit: { 'host.wraithguard': record('Wraithguard', { faction: 'host', keywords: [], sizes: [5] }) },
        model: {
          'host.wraithguard.model': record('Wraithguard', {
            unit: 'host.wraithguard',
            min: 5,
            max: 5,
            wargear: { 'host.wraithcannon': 1 },
          }),
        },
        'roster-option': {
          'host.wraithguard.weapon': record('Weapon', {
            unit: 'host.wraithguard',
            carrier: 'host.wraithguard.model',
            per: 'carrier',
            choose: { min: 0, max: 1 },
            uniform: true,
            replaces: { 'host.wraithcannon': 1 },
            choices: ['host.d-scythe'],
          }),
        },
        wargear: { 'host.wraithcannon': record('Wraithcannon', {}), 'host.d-scythe': record('D-scythe', {}) },
      },
    },
    { books: { cat: 'host' }, detachments: {}, units: { wraithguard: 'host.wraithguard' }, enhancements: {} },
    null,
    (id) => ({ wraithguard: 'Wraithguard' })[id],
  ),
}

it('reports no free wargear left out where a VS option swaps wargear', async () => {
  vi.mocked(app).mockReturnValue({ catalogueFor: async () => book, rulesFor: async () => null } as never)
  const roster = {
    name: 'Army',
    catalogueId: 'cat',
    detachmentIds: [],
    disposition: null,
    limit: 2000,
    picks: [{ entryId: 'wraithguard', vs: { models: {}, options: {} } }],
  }
  expect((await rosterSummary(roster))?.freeWargearLeftOut).toEqual([])
})
