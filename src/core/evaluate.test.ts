import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate, type Selection } from './evaluate'

const PTS = 'cost-pts'

/** A game system carrying only what a points question needs. */
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

function indexOf(catalogue: Partial<Catalogue>) {
  return buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')
}

const evaluateOne = (selection: Selection, catalogue: Partial<Catalogue>) => evaluate([selection], indexOf(catalogue))

describe('costs', () => {
  it('are read from the entry', () => {
    const result = evaluateOne({ id: 'tank' }, { sharedSelectionEntries: [{ id: 'tank', name: 'Tank', type: 'unit', costs: points(150) }] })
    expect(result.points).toBe(150)
  })

  it('are counted once per selection', () => {
    const result = evaluateOne(
      { id: 'grunt', count: 5 },
      {
        sharedSelectionEntries: [{ id: 'grunt', name: 'Grunt', type: 'model', costs: points(12) }],
      },
    )
    expect(result.points).toBe(60)
  })

  it('are reported under the name the data gives the cost type', () => {
    const result = evaluateOne({ id: 'tank' }, { sharedSelectionEntries: [{ id: 'tank', name: 'Tank', type: 'unit', costs: points(150) }] })
    expect(result.costs.pts).toBe(150)
  })
})

/**
 * The shape every squad in the real data uses: one price on the unit, replaced by
 * a bigger one once enough models are in the group beneath it.
 */
const squad = (): Partial<Catalogue> => ({
  sharedSelectionEntries: [
    {
      id: 'squad',
      name: 'Squad',
      type: 'unit',
      costs: points(80),
      modifiers: [
        {
          type: 'set',
          field: PTS,
          value: 150,
          conditions: [
            { type: 'atLeast', value: 6, field: 'selections', scope: 'squad', childId: 'troopers', includeChildSelections: true },
          ],
        },
      ],
      selectionEntryGroups: [
        {
          id: 'troopers',
          name: 'Troopers',
          constraints: [{ id: 'min', type: 'min', value: 4, field: 'selections', scope: 'parent' }],
          selectionEntries: [{ id: 'trooper', name: 'Trooper', type: 'model' }],
        },
      ],
    },
  ],
})

const withTroopers = (count: number): Selection => ({
  id: 'squad',
  selections: [{ id: 'troopers', selections: [{ id: 'trooper', count }] }],
})

describe('a squad priced by its size', () => {
  it('keeps the base price below the threshold', () => {
    expect(evaluateOne(withTroopers(4), squad()).points).toBe(80)
  })

  it('takes the larger price once the group is big enough', () => {
    expect(evaluateOne(withTroopers(9), squad()).points).toBe(150)
  })

  it('counts the models inside a group rather than the group itself', () => {
    // A group is a container, not one selection. Counting it as one priced every
    // large squad as a small one.
    expect(evaluateOne(withTroopers(6), squad()).points).toBe(150)
  })
})

describe('per-model costs', () => {
  it('apply once per repeat of what they count', () => {
    const result = evaluateOne(withTroopers(6), {
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(0),
          modifiers: [
            {
              type: 'increment',
              field: PTS,
              value: 10,
              repeats: [{ value: 2, repeats: 1, field: 'selections', scope: 'squad', childId: 'troopers', includeChildSelections: true }],
            },
          ],
          selectionEntryGroups: [
            { id: 'troopers', name: 'Troopers', selectionEntries: [{ id: 'trooper', name: 'Trooper', type: 'model' }] },
          ],
        },
      ],
    })
    expect(result.points).toBe(30)
  })
})

describe('gates', () => {
  it('refuse a condition group whose contents were not understood', () => {
    // Failing closed matters: a gate the evaluator cannot read must not be able
    // to add points, which is what an empty `and` did when read as satisfied.
    const result = evaluateOne(
      { id: 'tank' },
      {
        sharedSelectionEntries: [
          {
            id: 'tank',
            name: 'Tank',
            type: 'unit',
            costs: points(100),
            modifiers: [{ type: 'increment', field: PTS, value: 15, conditionGroups: [{ type: 'and' }] }],
          },
        ],
      },
    )
    expect(result.points).toBe(100)
  })

  it('say so, rather than passing silently', () => {
    const result = evaluateOne(
      { id: 'tank' },
      {
        sharedSelectionEntries: [
          {
            id: 'tank',
            name: 'Tank',
            type: 'unit',
            costs: points(100),
            modifiers: [{ type: 'increment', field: PTS, value: 15, conditionGroups: [{ type: 'and' }] }],
          },
        ],
      },
    )
    expect(result.unhandled).toContain('condition group with nothing readable in it')
  })
})

describe('legality', () => {
  it('reports a group that is under its minimum', () => {
    const result = evaluateOne(withTroopers(2), squad())
    expect(result.errors).toEqual([{ entryId: 'troopers', entryName: 'Troopers', message: 'needs at least 4, has 2' }])
  })

  it('accepts a group that meets its minimum', () => {
    expect(evaluateOne(withTroopers(4), squad()).errors).toEqual([])
  })

  it('reports a maximum that has been exceeded', () => {
    const result = evaluateOne(
      { id: 'squad', selections: [{ id: 'trooper', count: 4 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'squad',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'cap', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    )
    expect(result.errors[0]?.message).toBe('allows at most 3, has 4')
  })

  it('treats a negative limit as no limit', () => {
    const result = evaluateOne(
      { id: 'squad', selections: [{ id: 'trooper', count: 99 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'squad',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'cap', type: 'max', value: -1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    )
    expect(result.errors).toEqual([])
  })

  it('takes a limit raised by a modifier aimed at the constraint', () => {
    const result = evaluateOne(
      { id: 'squad', selections: [{ id: 'trooper', count: 4 }] },
      {
        sharedSelectionEntries: [
          {
            id: 'squad',
            name: 'Squad',
            type: 'unit',
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'cap', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
                modifiers: [{ type: 'set', field: 'cap', value: 6 }],
              },
            ],
          },
        ],
      },
    )
    expect(result.errors).toEqual([])
  })
})

describe('an unknown selection', () => {
  it('is named in the census rather than ignored', () => {
    expect(evaluateOne({ id: 'nonsense' }, {}).unhandled).toContain('unknown selection id nonsense')
  })
})
