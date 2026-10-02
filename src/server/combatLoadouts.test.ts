import { describe, expect, it } from 'vitest'
import type { SelectionEntry } from '../core/catalogue'
import { bookOf, points } from './catalogue.fixtures'
import { checkCombatLoadouts, combatLoadoutSpace } from './combatLoadouts'

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

describe('combat loadout space', () => {
  it('measures a specialist as one model swapping its weapon', () => {
    const specialist = combatLoadoutSpace(book, request)?.axes[0]?.options.find((option) => option.name === 'Specialist')
    expect(specialist?.change).toEqual([
      { name: 'Trooper', models: -1, weapons: [{ name: 'Boltgun', count: -1, profileIds: ['boltgun-profile'] }] },
      { name: 'Specialist', models: 1, weapons: [{ name: 'Plasma gun', count: 1, profileIds: ['plasma-profile'] }] },
    ])
  })
  it('offers every weapon profile the unit can take', () => {
    expect(combatLoadoutSpace(book, request)?.weapons.map((profile) => profile.name)).toEqual(['Boltgun', 'Plasma gun'])
  })
})

describe('checked combat loadouts', () => {
  const spread = (specialists: number) => ({ entryId: 'squad', spreads: { models: { trooper: 3 - specialists, specialist: specialists } } })
  it('builds a legal candidate with its real carriers', () => {
    expect(checkCombatLoadouts(book, { ...request, candidates: [spread(1)] })?.[0]?.carriers).toContainEqual({
      name: 'Specialist',
      models: 1,
      weapons: [{ name: 'Plasma gun', count: 1, profileIds: ['plasma-profile'] }],
    })
  })
  it('reports the points a candidate adds', () => {
    expect(checkCombatLoadouts(book, { ...request, candidates: [spread(1)] })?.[0]?.points).toBe(5)
  })
  it('refuses a candidate over a model limit', () => {
    expect(checkCombatLoadouts(book, { ...request, candidates: [spread(2)] })?.[0]?.legal).toBe(false)
  })
})
