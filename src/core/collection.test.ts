import { describe, expect, it } from 'vitest'
import { boundedProgress, usableDatasheets, groupCollection } from './collection'

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

describe('bounded progress', () => {
  it('lowers built models to the owned count', () => {
    expect(boundedProgress(3, { built: 5, painted: 0 })).toEqual({ built: 3, painted: 0 })
  })
  it('lowers painted models to the built count', () => {
    expect(boundedProgress(10, { built: 4, painted: 6 })).toEqual({ built: 4, painted: 4 })
  })
  it('keeps possible counts', () => {
    expect(boundedProgress(10, { built: 6, painted: 2 })).toEqual({ built: 6, painted: 2 })
  })
})

describe('usable datasheets', () => {
  it('includes what the owned models also count as', () => {
    expect(usableDatasheets(['russ'], { russ: ['demolisher'] })).toEqual(new Set(['russ', 'demolisher']))
  })

  it('ignores links from datasheets the player does not own', () => {
    expect(usableDatasheets([], { russ: ['demolisher'] })).toEqual(new Set())
  })
})

describe('grouped photos of other builds', () => {
  it('names the datasheet a photo shows', () => {
    expect(
      groupCollection([{ entryId: 'warriors', models: 1, photoIds: ['photo'], photoShows: { photo: 'overlord' } }], factions)[0]!
        .entries[0]!.photoShows,
    ).toEqual({ photo: { entryId: 'overlord', name: 'Overlord' } })
  })
})
