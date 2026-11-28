import { describe, expect, it } from 'vitest'
import { buildIndex } from '../core/catalogue'
import type { LoadedCatalogue } from './catalogueIndex'
import type { RosterPick } from '../core/roster'
import { buildPick, vsPickKeywords } from './vsDataBuild'
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
      model: {
        'host.mob.grunt': record('Grunt', { unit: 'host.mob', min: 10, max: 20, wargear: {} }),
        'host.mob.boss': record('Boss', { unit: 'host.mob', min: 0, max: 1, wargear: {}, keywords: ['CHARACTER'] }),
      },
    },
  },
  { books: { 'bs-host': 'host' }, detachments: {}, units: { 'bs-mob': 'host.mob' }, enhancements: {} },
  null,
  () => 'Mob',
)
const built = (models?: number, vs?: RosterPick['vs']) =>
  buildPick(
    { index, vsRoster } as LoadedCatalogue,
    { entryId: 'bs-mob', models, ...(vs ? { vs } : {}) },
    { catalogueId: 'bs-host', detachmentIds: [] },
    {},
  )

describe('a catalogue pick of a datasheet VS Data sizes', () => {
  it('steps between the sizes VS Data fields', () => expect(built(10)!.size.options).toEqual([10, 20]))

  it('fields the nearest of them for a size between', () => expect(built(14)!.size.models).toBe(10))

  it('starts at the smallest of them', () => expect(built()!.size.models).toBe(10))
})

describe('a VS pick moved into this rules version', () => {
  it('builds by VS Data where the version holds its models', () =>
    expect(built(undefined, { models: { 'host.mob.grunt': 10 }, options: {} })!.vs).toBeDefined())

  it('builds by its catalogue choices where the version no longer holds them', () =>
    expect(built(undefined, { models: { 'host.mob.ghost': 10 }, options: {} })!.vs).toBeUndefined())
})

describe('a VS pick’s keywords', () => {
  const keywordsOf = (models: Record<string, number>) =>
    vsPickKeywords(
      { index, vsRoster } as LoadedCatalogue,
      { catalogueId: 'bs-host', detachmentIds: [], limit: 2000 },
      [{ entryId: 'bs-mob', vs: built(undefined, { models, options: {} })!.vs }],
      0,
    )

  it('take a fielded model’s own', () => expect(keywordsOf({ 'host.mob.grunt': 9, 'host.mob.boss': 1 })).toContain('Character'))

  it('leave out those of a model it does not field', () => expect(keywordsOf({ 'host.mob.grunt': 10 })).not.toContain('Character'))
})
