import { describe, expect, it } from 'vitest'
import { collectionAvailability, collectionGroupsSchema, groupCollection } from './collection'

const arkGroups = [
  {
    models: 1,
    state: 'interchangeable' as const,
    builds: [
      { entryId: 'doomsday', equipment: '' },
      { entryId: 'ghost', equipment: '' },
    ],
  },
]

it('counts one interchangeable model once for each supported datasheet', () => {
  expect(collectionAvailability([{ entryId: 'doomsday', models: 1, groups: arkGroups }])).toEqual({ doomsday: 1, ghost: 1 })
})

it('does not multiply physical stock by its equipment combinations', () => {
  const builds = ['staff, orb', 'blade, orb', 'staff, scarab', 'blade, scarab'].map((equipment) => ({ entryId: 'lord', equipment }))
  expect(collectionAvailability([{ entryId: 'lord', models: 1, groups: [{ models: 1, state: 'interchangeable', builds }] }])).toEqual({
    lord: 1,
  })
})

it('adds separate fixed and interchangeable models without merging their stock', () => {
  expect(
    collectionAvailability([
      { entryId: 'doomsday', models: 1, groups: arkGroups },
      { entryId: 'ghost', models: 2 },
    ]),
  ).toEqual({ doomsday: 1, ghost: 3 })
})

it('preserves older datasheet identities when the current rules no longer offer them', () => {
  expect(collectionAvailability([{ entryId: 'retired', models: 2 }])).toEqual({ retired: 2 })
})

it('refuses a fixed model with alternative builds', () => {
  expect(collectionGroupsSchema.safeParse([{ ...arkGroups[0], state: 'fixed' }]).success).toBe(false)
})

it('refuses a group total above the collection count limit', () => {
  expect(
    collectionGroupsSchema.safeParse([
      { ...arkGroups[0], models: 10_000 },
      { ...arkGroups[0], models: 1 },
    ]).success,
  ).toBe(false)
})

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
