import { describe, expect, it } from 'vitest'
import type { SelectionEntry } from '../core/catalogue'
import { bookOf, points } from './catalogue.fixtures'
import { combatLoadoutSpace } from '../shared/combatLoadouts'

const weapon = (id: string, name: string): SelectionEntry => ({
  id,
  name,
  type: 'upgrade',
  constraints: [
    { id: `${id}-min`, type: 'min', value: 1, field: 'selections', scope: 'parent' },
    { id: `${id}-max`, type: 'max', value: 1, field: 'selections', scope: 'parent' },
  ],
  profiles: [
    {
      id: `${id}-profile`,
      name,
      typeName: 'Ranged Weapons',
      characteristics: Object.entries({ Range: '24"', A: '2', BS: '3+', S: '4', AP: '0', D: '1', Keywords: '-' }).map(
        ([characteristic, $text]) => ({ name: characteristic, typeId: characteristic, $text }),
      ),
    },
  ],
})
const model = (id: string, name: string, max: number, carried: SelectionEntry, cost = 0): SelectionEntry => ({
  id,
  name,
  type: 'model',
  costs: points(cost),
  constraints: [{ id: `${id}-max`, type: 'max', value: max, field: 'selections', scope: 'parent' }],
  selectionEntries: [carried],
})
const book = bookOf({
  selectionEntries: [
    {
      id: 'squad',
      name: 'Squad',
      type: 'unit',
      selectionEntryGroups: [
        {
          id: 'models',
          name: 'Models',
          defaultSelectionEntryId: 'trooper',
          constraints: [
            { id: 'models-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
            { id: 'models-max', type: 'max', value: 3, field: 'selections', scope: 'parent' },
          ],
          selectionEntries: [
            model('trooper', 'Trooper', 3, weapon('boltgun', 'Boltgun'), 10),
            model('specialist', 'Specialist', 1, weapon('plasma', 'Plasma gun'), 15),
          ],
        },
      ],
    },
  ],
})
const request = { catalogueId: 'cat', detachmentIds: [], picks: [{ entryId: 'squad' }], pickIndex: 0 }

const option = (spreads: Record<string, number> | undefined, entry: string) =>
  combatLoadoutSpace(book, { ...request, picks: [{ entryId: 'squad', ...(spreads ? { spreads: { models: spreads } } : {}) }] })
    ?.choices.flat()
    .find((candidate) => candidate.entry === entry)

describe('combat loadout space', () => {
  it('builds an option given to one more model with its real carriers', () => {
    expect(option(undefined, 'specialist')?.carriers).toContainEqual({
      name: 'Specialist',
      models: 1,
      weapons: [{ name: 'Plasma gun', count: 1, profileIds: ['plasma-profile'] }],
    })
  })
  it('says the option is given to one more model', () => {
    expect(option(undefined, 'specialist')?.step).toBe(1)
  })
  it('takes one model away from an option at its limit', () => {
    expect(option({ trooper: 2, specialist: 1 }, 'specialist')?.step).toBe(-1)
  })
  it('keeps the squad as it stands for the option that gives up models', () => {
    expect(option(undefined, 'trooper')).toMatchObject({ step: 0, carriers: combatLoadoutSpace(book, request)?.carriers })
  })
  it('offers every weapon profile the unit can take', () => {
    expect(combatLoadoutSpace(book, request)?.weapons.map((profile) => profile.name)).toEqual(['Boltgun', 'Plasma gun'])
  })
})
