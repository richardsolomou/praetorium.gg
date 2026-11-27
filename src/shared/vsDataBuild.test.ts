import { describe, expect, it } from 'vitest'
import { buildIndex } from '../core/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import { buildPick } from './vsDataBuild'
import { vsRosterData } from './vsDataLegality'

const bounded = (min: number, max: number) => [
  { id: 'min', type: 'min' as const, value: min, field: 'selections', scope: 'parent' },
  { id: 'max', type: 'max' as const, value: max, field: 'selections', scope: 'parent' },
]
const index = buildIndex(
  [
    { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: 'pts', name: 'pts' }] } },
    {
      catalogue: {
        id: 'bs-host',
        name: 'Host',
        sharedSelectionEntries: [
          {
            id: 'bs-mob',
            name: 'Mob',
            type: 'unit',
            selectionEntries: [{ id: 'grunt', name: 'Grunt', type: 'model', constraints: bounded(1, 20) }],
          },
        ],
      },
    },
  ],
  'test-revision',
)
const record = (name: string, data: Record<string, unknown>) => ({ name, data: { formatVersion: 2, ...data } })
const vsRoster = vsRosterData(
  {
    release: 'test',
    rulesVersion: { edition: '11th', update: 'test' },
    unavailable: [],
    points: [],
    definitions: {
      faction: { host: record('Host', {}) },
      unit: { 'host.mob': record('Mob', { faction: 'host', keywords: ['INFANTRY'], sizes: [10, 20] }) },
      model: { 'host.mob.grunt': record('Grunt', { unit: 'host.mob', min: 10, max: 20, wargear: {} }) },
    },
  },
  { books: { 'bs-host': 'host' }, detachments: {}, units: { 'bs-mob': 'host.mob' }, enhancements: {} },
  null,
  () => 'Mob',
)
const built = (models?: number) =>
  buildPick({ index, vsRoster } as LoadedCatalogue, { entryId: 'bs-mob', models }, { catalogueId: 'bs-host', detachmentIds: [] }, {})

describe('a catalogue pick of a datasheet VS Data sizes', () => {
  it('steps between the sizes VS Data fields', () => expect(built(10)!.size.options).toEqual([10, 20]))

  it('fields the nearest of them for a size between', () => expect(built(14)!.size.models).toBe(10))

  it('starts at the smallest of them', () => expect(built()!.size.models).toBe(10))
})
