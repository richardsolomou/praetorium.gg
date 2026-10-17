import { describe, expect, it } from 'vitest'
import { groupCollection } from './collection'

const factions = [
  {
    catalogueId: 'necrons',
    name: 'Necrons',
    units: [
      { id: 'warriors', slug: 'warriors', name: 'Warriors' },
      { id: 'overlord', slug: 'overlord', name: 'Overlord' },
    ],
  },
  {
    catalogueId: 'marines',
    name: 'Space Marines',
    units: [
      { id: 'intercessors', slug: 'intercessors', name: 'Intercessors' },
      { id: 'overlord', slug: 'shared', name: 'Shared Overlord' },
    ],
  },
]

describe('collection grouped by faction', () => {
  it('shows no groups for an empty shelf', () => {
    expect(groupCollection([], factions)).toEqual([])
  })
  it('counts physical models for one datasheet', () => {
    expect(groupCollection([{ entryId: 'warriors', models: 100 }], factions)).toEqual([
      {
        catalogueId: 'necrons',
        name: 'Necrons',
        models: 100,
        entries: [{ entryId: 'warriors', slug: 'warriors', name: 'Warriors', models: 100 }],
      },
    ])
  })
  it('totals models within each faction and lists shared datasheets only once', () => {
    expect(
      groupCollection(
        [
          { entryId: 'warriors', models: 30 },
          { entryId: 'overlord', models: 2 },
          { entryId: 'intercessors', models: 10 },
        ],
        factions,
      ),
    ).toEqual([
      {
        catalogueId: 'necrons',
        name: 'Necrons',
        models: 32,
        entries: [
          { entryId: 'overlord', slug: 'overlord', name: 'Overlord', models: 2 },
          { entryId: 'warriors', slug: 'warriors', name: 'Warriors', models: 30 },
        ],
      },
      {
        catalogueId: 'marines',
        name: 'Space Marines',
        models: 10,
        entries: [{ entryId: 'intercessors', slug: 'intercessors', name: 'Intercessors', models: 10 }],
      },
    ])
  })
  it('keeps counts for datasheets absent from the current rules', () => {
    expect(groupCollection([{ entryId: 'retired', models: 3 }], factions)).toEqual([
      {
        catalogueId: null,
        name: 'Earlier rules',
        models: 3,
        entries: [{ entryId: 'retired', slug: null, name: 'A datasheet from earlier rules', models: 3 }],
      },
    ])
  })
})
