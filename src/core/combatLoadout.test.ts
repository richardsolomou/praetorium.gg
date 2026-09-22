import { describe, expect, it } from 'vitest'
import { buildIndex } from './catalogue'
import { combatCarriers } from './combatLoadout'

const index = buildIndex(
  [
    {
      catalogue: {
        id: 'catalogue',
        name: 'Catalogue',
        costTypes: [{ id: 'pts', name: 'pts' }],
        selectionEntries: [
          {
            id: 'unit',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              { id: 'leader', name: 'Leader', type: 'model', selectionEntries: [{ id: 'fist', name: 'Fist', type: 'upgrade' }] },
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                selectionEntries: [
                  { id: 'rifle', name: 'Rifle', type: 'upgrade', collective: true },
                  { id: 'blade', name: 'Blade', type: 'upgrade' },
                ],
              },
            ],
          },
          { id: 'tank', name: 'Tank', type: 'unit', selectionEntries: [{ id: 'cannon', name: 'Cannon', type: 'upgrade' }] },
        ],
      },
    },
  ],
  'test',
)

describe('combat weapon ownership', () => {
  it('keeps specialists separate and respects pooled and per-model counts', () => {
    expect(
      combatCarriers(
        {
          id: 'unit',
          selections: [
            { id: 'leader', count: 1, selections: [{ id: 'fist' }] },
            { id: 'trooper', count: 4, selections: [{ id: 'rifle', count: 4 }, { id: 'blade' }] },
          ],
        },
        index,
      ),
    ).toEqual([
      { name: 'Leader', models: 1, weapons: [{ name: 'Fist', count: 1 }] },
      {
        name: 'Trooper',
        models: 4,
        weapons: [
          { name: 'Rifle', count: 4 },
          { name: 'Blade', count: 4 },
        ],
      },
    ])
  })
  it('treats a unit without model children as one model', () => {
    expect(combatCarriers({ id: 'tank', selections: [{ id: 'cannon', count: 2 }] }, index)).toEqual([
      { name: 'Tank', models: 1, weapons: [{ name: 'Cannon', count: 2 }] },
    ])
  })
  it('does not count removed models', () => {
    expect(
      combatCarriers(
        {
          id: 'unit',
          selections: [
            { id: 'leader', count: 0, selections: [{ id: 'fist' }] },
            { id: 'trooper', selections: [{ id: 'blade' }] },
          ],
        },
        index,
      ).map((carrier) => carrier.name),
    ).toEqual(['Trooper'])
  })
})
