import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { buildUnit } from './roster'
import { modelCountChoices, modelCountOf, sizeOf, unitSize } from './unitSize'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const mandatory = (id: string) => [{ id, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }]

/** The common shape: a fixed leader, plus a group of bodies the player sizes. */
const sizedSquad = (): Partial<Catalogue> => ({
  sharedSelectionEntries: [
    {
      id: 'squad',
      name: 'Squad',
      type: 'unit',
      selectionEntries: [
        {
          id: 'sergeant',
          name: 'Sergeant',
          type: 'model',
          constraints: [
            { id: 'sgt-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
            { id: 'sgt-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
          ],
        },
      ],
      selectionEntryGroups: [
        {
          id: 'bodies',
          name: 'Bodies',
          selectionEntries: [
            {
              id: 'trooper',
              name: 'Trooper',
              type: 'model',
              constraints: [
                { id: 'trooper-min', type: 'min', value: 4, field: 'selections', scope: 'parent' },
                { id: 'trooper-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
              ],
            },
          ],
        },
      ],
    },
  ],
})

describe('how many models a unit may field', () => {
  const squad = sizedSquad

  it('counts the leader and the bodies together', () => {
    expect(unitSize('squad', indexOf(squad()))?.models).toBe(5)
  })

  it('takes its bounds from the occupants when the group states none', () => {
    // A group written as "3-9 Prosecutors" often carries no constraints itself.
    expect(unitSize('squad', indexOf(squad()))).toMatchObject({ min: 5, max: 10 })
  })

  it('never reports a minimum above what it built', () => {
    const size = unitSize('squad', indexOf(squad()))!
    expect(size.min).toBeLessThanOrEqual(size.models)
  })

  it('resizes by changing the bodies, not the leader', () => {
    const built = buildUnit('squad', indexOf(squad()), 8)
    expect(built?.selection.selections?.find((child) => child.id === 'sergeant')?.count).toBe(1)
  })

  it('reaches the size asked for', () => {
    expect(buildUnit('squad', indexOf(squad()), 8)?.size.models).toBe(8)
  })

  it('keeps a group fixed at a size fixed, whatever its occupants could each take', () => {
    // Wyches: "9 Wyches" is always nine, of 6-9 Wyches and up to 3 with Gladiatorial weapons.
    const fixed = sizedSquad()
    fixed.sharedSelectionEntries![0]!.selectionEntryGroups![0]!.constraints = [
      { id: 'bodies-min', type: 'min', value: 9, field: 'selections', scope: 'parent' },
      { id: 'bodies-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
    ]
    fixed.sharedSelectionEntries![0]!.selectionEntryGroups![0]!.selectionEntries!.push({
      id: 'specialist',
      name: 'Specialist',
      type: 'model',
      constraints: [{ id: 'specialist-max', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
    })
    expect(unitSize('squad', indexOf(fixed))).toMatchObject({ min: 10, max: 10 })
  })

  it('selects and expands a fixed composition for the requested size', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'fixed-squad',
          name: 'Fixed squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Unit Composition',
              defaultSelectionEntryId: 'ten',
              constraints: [
                ...mandatory('composition-min'),
                { id: 'composition-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
              ],
              selectionEntries: [
                {
                  id: 'ten',
                  name: '10 models',
                  type: 'upgrade',
                  selectionEntries: [
                    {
                      id: 'ten-models',
                      name: 'Models',
                      type: 'model',
                      constraints: [{ id: 'ten-min', type: 'min', value: 10, field: 'selections', scope: 'parent' }],
                    },
                  ],
                },
                {
                  id: 'twenty',
                  name: '20 models',
                  type: 'upgrade',
                  selectionEntries: [
                    {
                      id: 'twenty-models',
                      name: 'Models',
                      type: 'model',
                      constraints: [{ id: 'twenty-min', type: 'min', value: 20, field: 'selections', scope: 'parent' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    const built = buildUnit('fixed-squad', index, 20)!
    expect(modelCountOf(built.selection, index)).toBe(20)
  })

  it('fills a bounded optional model slot to complete a requested composition', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'handlers',
          name: 'Handlers',
          type: 'unit',
          selectionEntries: [
            {
              id: 'body',
              name: 'Body',
              type: 'model',
              constraints: [
                { id: 'body-min', type: 'min', value: 10, field: 'selections', scope: 'parent' },
                { id: 'body-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
              ],
            },
            {
              id: 'handler',
              name: 'Handler',
              type: 'model',
              constraints: [{ id: 'handler-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
            },
          ],
        },
      ],
    })

    const built = buildUnit('handlers', index, 12)!
    expect(modelCountOf(built.selection, index)).toBe(12)
  })

  it('scales every bounded model type in a proportional composition', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'mixed',
          name: 'Mixed unit',
          type: 'unit',
          selectionEntries: [
            {
              id: 'large',
              name: 'Large model',
              type: 'model',
              constraints: [
                { id: 'large-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                { id: 'large-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
              ],
            },
            {
              id: 'small',
              name: 'Small model',
              type: 'model',
              constraints: [
                { id: 'small-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
                { id: 'small-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
              ],
            },
          ],
        },
      ],
    })

    const built = buildUnit('mixed', index, 16)!
    expect(modelCountOf(built.selection, index)).toBe(16)
  })

  it('resizes a model inside nested groups instead of counting the container', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'nested-squad',
          name: 'Nested squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Composition',
              constraints: [{ id: 'composition-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
              selectionEntryGroups: [
                {
                  id: 'bodies',
                  name: '3-6 bodies',
                  constraints: [{ id: 'bodies-min', type: 'min', value: 3, field: 'selections', scope: 'parent' }],
                  selectionEntries: [
                    {
                      id: 'body',
                      name: 'Body',
                      type: 'model',
                      constraints: [
                        { id: 'body-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                        { id: 'body-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    const built = buildUnit('nested-squad', index, 6)!
    expect(modelCountOf(built.selection, index)).toBe(6)
  })

  describe('a bounded model group inside an unbounded composition group', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'destroyers',
          name: 'Destroyers',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Unit Composition',
              selectionEntries: [{ id: 'token', name: 'Token', type: 'upgrade', constraints: mandatory('token-min') }],
              selectionEntryGroups: [
                {
                  id: 'bodies',
                  name: '3-6 models',
                  constraints: [
                    { id: 'bodies-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                    { id: 'bodies-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
                  ],
                  selectionEntries: [
                    {
                      id: 'destroyer',
                      name: 'Destroyer',
                      type: 'model',
                      constraints: [
                        { id: 'model-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                        { id: 'model-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    it('preserves the nested model limits', () => {
      expect(unitSize('destroyers', index)).toEqual({ min: 3, max: 6, models: 3, path: ['composition', 'bodies', 'destroyer'] })
    })

    it.each([
      [1, 3],
      [6, 6],
      [7, 6],
    ])('clamps a request for %i models to %i', (requested, expected) => {
      expect(modelCountOf(buildUnit('destroyers', index, requested)!.selection, index)).toBe(expected)
    })
  })

  it('keeps sizing the required squad once a wider optional group holds a model', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'pack-squad',
          name: 'Pack squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'guard',
              name: '3-6 Guard',
              constraints: [
                { id: 'guard-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                { id: 'guard-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
              ],
              selectionEntries: [{ id: 'guardsman', name: 'Guardsman', type: 'model' }],
            },
            {
              id: 'beasts',
              name: 'Beasts',
              constraints: [{ id: 'beasts-max', type: 'max', value: 6, field: 'selections', scope: 'parent' }],
              selectionEntries: [{ id: 'beast', name: 'Beast', type: 'model' }],
            },
          ],
        },
      ],
    })
    const selection = {
      id: 'pack-squad',
      count: 1,
      selections: [
        { id: 'guard', count: 1, selections: [{ id: 'guardsman', count: 3 }] },
        { id: 'beasts', count: 1, selections: [{ id: 'beast', count: 1 }] },
      ],
    }

    expect(sizeOf(selection, index).path).toEqual(['guard', 'guardsman'])
  })

  it('grows a lone leader into an optional group of models it has not taken', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'battlesuits',
          name: 'Battlesuits',
          type: 'unit',
          selectionEntries: [
            {
              id: 'leader',
              name: 'Leader',
              type: 'model',
              constraints: [
                { id: 'leader-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                { id: 'leader-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
              ],
            },
          ],
          selectionEntryGroups: [
            {
              id: 'wing',
              name: 'Wing (0-2)',
              selectionEntries: [
                {
                  id: 'wingman',
                  name: 'Wingman',
                  type: 'model',
                  constraints: [{ id: 'wingman-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                },
              ],
            },
          ],
        },
      ],
    })

    const leaderOnly = { id: 'battlesuits', count: 1, selections: [{ id: 'leader', count: 1 }] }

    expect(sizeOf(leaderOnly, index)).toMatchObject({ min: 1, max: 3, path: ['wing', 'wingman'] })
  })

  it('clamps a size the data does not allow', () => {
    expect(buildUnit('squad', indexOf(squad()), 99)?.size.models).toBe(10)
  })

  it('treats a lone character as one model', () => {
    const index = indexOf({ sharedSelectionEntries: [{ id: 'captain', name: 'Captain', type: 'model' }] })
    expect(unitSize('captain', index)).toMatchObject({ min: 1, max: 1, models: 1 })
  })
})

describe('which model counts a player can pick directly', () => {
  it('offers only the sizes a fixed composition allows', () => {
    expect(modelCountChoices({ min: 10, max: 20, options: [10, 20] })).toEqual([10, 20])
  })

  it('drops fixed sizes beyond a lower ceiling', () => {
    expect(modelCountChoices({ min: 5, max: 10, options: [5, 10, 15] })).toEqual([5, 10])
  })

  it('lists every count in a free range', () => {
    expect(modelCountChoices({ min: 5, max: 10 })).toEqual([5, 6, 7, 8, 9, 10])
  })

  it('offers nothing for a fixed-size unit', () => {
    expect(modelCountChoices({ min: 5, max: 5 })).toEqual([])
  })

  it('offers nothing for a range too wide to list', () => {
    expect(modelCountChoices({ min: 4, max: Number.MAX_SAFE_INTEGER })).toEqual([])
  })
})
