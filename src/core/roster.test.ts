import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate, type Selection } from './evaluate'
import { buildUnit, defaultSelection, modelCountOf, unitChoices, unitSize, wargearOf, withChoice, withCounts, withSpread } from './roster'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const mandatory = (id: string) => [{ id, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }]

describe('the default selection for a unit', () => {
  it('includes wargear the data insists on', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          selectionEntries: [{ id: 'sword', name: 'Sword', type: 'upgrade', constraints: mandatory('sword-min') }],
        },
      ],
    })
    expect(defaultSelection('captain', index)?.selections?.map((child) => child.id)).toEqual(['sword'])
  })

  it('leaves out wargear the player has to choose', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          selectionEntries: [{ id: 'relic', name: 'Relic blade', type: 'upgrade' }],
        },
      ],
    })
    expect(defaultSelection('captain', index)?.selections).toBeUndefined()
  })

  it('leaves out anything hidden', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          selectionEntries: [{ id: 'legacy', name: 'Legacy option', type: 'upgrade', hidden: true, constraints: mandatory('legacy-min') }],
        },
      ],
    })
    expect(defaultSelection('captain', index)?.selections).toBeUndefined()
  })

  it('takes as many as the minimum asks for', () => {
    const index = indexOf({
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
              constraints: [{ id: 'trooper-min', type: 'min', value: 4, field: 'selections', scope: 'parent' }],
            },
          ],
        },
      ],
    })
    expect(defaultSelection('squad', index)?.selections?.[0]?.count).toBe(4)
  })

  it('follows a link to what it points at', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          entryLinks: [{ id: 'link', targetId: 'sword', constraints: mandatory('link-min') }],
        },
        { id: 'sword', name: 'Sword', type: 'upgrade' },
      ],
    })
    expect(defaultSelection('captain', index)?.selections?.[0]?.id).toBe('link')
  })

  it('is absent for an id the data does not know', () => {
    expect(defaultSelection('nonsense', indexOf({}))).toBeNull()
  })
})

describe('a group that requires selections', () => {
  const group = (requirement: number, options: { id: string; name: string; max?: number; points?: number }[]): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'wargear',
            name: 'Wargear',
            constraints: [{ id: 'group-min', type: 'min', value: requirement, field: 'selections', scope: 'parent' }],
            selectionEntries: options.map((option) => ({
              id: option.id,
              name: option.name,
              type: 'upgrade' as const,
              costs: option.points === undefined ? undefined : [{ name: 'pts', typeId: PTS, value: option.points }],
              constraints:
                option.max === undefined
                  ? []
                  : [{ id: `${option.id}-max`, type: 'max' as const, value: option.max, field: 'selections', scope: 'parent' }],
            })),
          },
        ],
      },
    ],
  })

  const chosen = (catalogue: Partial<Catalogue>) =>
    defaultSelection('squad', indexOf(catalogue))?.selections?.[0]?.selections?.map((child) => ({ id: child.id, count: child.count }))

  it('fills the group rather than leaving it empty', () => {
    // The requirement belongs to what goes inside a group, never to the group
    // itself: putting the number on the group left squads with no models in them.
    expect(chosen(group(4, [{ id: 'knife', name: 'Knife' }]))).toEqual([{ id: 'knife', count: 4 }])
  })

  it('finds required models inside a nested group', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Composition',
              selectionEntryGroups: [
                {
                  id: 'models',
                  name: 'Models',
                  selectionEntries: [
                    {
                      id: 'trooper',
                      name: 'Trooper',
                      type: 'model',
                      constraints: [{ id: 'trooper-min', type: 'min', value: 3, field: 'selections', scope: 'parent' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(modelCountOf(defaultSelection('squad', index)!, index)).toBe(3)
  })

  it('spreads the requirement across options that each allow only one', () => {
    const options = [
      { id: 'knife', name: 'Knife', max: 1 },
      { id: 'pistol', name: 'Pistol', max: 1 },
    ]
    expect(chosen(group(2, options))).toEqual([
      { id: 'knife', count: 1 },
      { id: 'pistol', count: 1 },
    ])
  })

  it('takes the cheapest option rather than putting points on a list nobody asked for', () => {
    const options = [
      { id: 'lance', name: 'Lance', points: 5 },
      { id: 'blade', name: 'Blade', points: 0 },
    ]
    expect(chosen(group(1, options))).toEqual([{ id: 'blade', count: 1 }])
  })

  it('prefers what the group names as its default over the cheapest', () => {
    const catalogue = group(1, [
      { id: 'lance', name: 'Lance', points: 5 },
      { id: 'blade', name: 'Blade', points: 0 },
    ])
    const squad = catalogue.sharedSelectionEntries?.[0]
    const wargear = squad?.selectionEntryGroups?.[0]
    if (!squad || !wargear) throw new Error('fixture lost its wargear group')
    squad.selectionEntryGroups = [{ ...wargear, defaultSelectionEntryId: 'lance' }]
    expect(chosen(catalogue)).toEqual([{ id: 'lance', count: 1 }])
  })
})

describe('mixed model composition', () => {
  const index = indexOf({
    sharedSelectionEntries: [
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
              { id: 'models-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'sergeant',
                name: 'Sergeant',
                type: 'model',
                constraints: [
                  ...mandatory('sergeant-min'),
                  { id: 'sergeant-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
              },
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                constraints: [{ id: 'trooper-max', type: 'max', value: 5, field: 'selections', scope: 'parent' }],
              },
              {
                id: 'specialist',
                name: 'Specialist',
                type: 'model',
                constraints: [{ id: 'specialist-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    ],
  })

  it('offers replacements without making the required model adjustable', () => {
    const built = buildUnit('squad', index)!
    const choice = built.choices.find((candidate) => candidate.name === 'Models')
    expect(choice?.room).toBe(2)
    expect(choice?.options.map(({ id, max }) => ({ id, max }))).toEqual([
      { id: 'trooper', max: 2 },
      { id: 'specialist', max: 1 },
    ])
  })
})

describe('repeated specialist models', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'models',
            name: 'Models',
            defaultSelectionEntryId: 'veteran',
            constraints: [
              { id: 'models-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'veteran',
                name: 'Veteran',
                type: 'model',
                constraints: [{ id: 'veteran-max', type: 'max', value: 9, field: 'selections', scope: 'parent' }],
                selectionEntries: [{ id: 'rifle', name: 'Rifle', type: 'upgrade', constraints: mandatory('rifle-min') }],
              },
              {
                id: 'sergeant',
                name: 'Sergeant',
                type: 'model',
                constraints: [
                  ...mandatory('sergeant-min'),
                  { id: 'sergeant-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
              },
              {
                id: 'gunner',
                name: 'Gunner',
                type: 'model',
                constraints: [{ id: 'gunner-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                modifiers: [
                  {
                    type: 'increment',
                    value: 1,
                    field: 'gunner-max',
                    conditions: [{ type: 'equalTo', value: 10, field: 'selections', scope: 'squad', childId: 'models' }],
                  },
                ],
                selectionEntryGroups: [
                  {
                    id: 'heavy-weapon',
                    name: 'Heavy weapon',
                    constraints: [
                      { id: 'weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [
                      { id: 'heavy-bolter', name: 'Heavy bolter', type: 'upgrade' },
                      { id: 'pyrecannon', name: 'Pyrecannon', type: 'upgrade' },
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
  const key = 'models/gunner/heavy-weapon'

  it('raises the nested choice capacity with its carrier model limit', () => {
    expect(buildUnit('squad', index, 5)?.choices.find((choice) => choice.key === key)?.room).toBe(1)
    expect(buildUnit('squad', index, 10)?.choices.find((choice) => choice.key === key)?.room).toBe(2)
  })

  it('can split repeated specialists between their nested choices', () => {
    const built = buildUnit('squad', index, 10, undefined, {
      spreads: { [key]: { 'heavy-bolter': 1, pyrecannon: 1 } },
    })!
    expect(modelCountOf(built.selection, index)).toBe(10)
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Rifle', count: 7 },
      { name: 'Heavy bolter', count: 1 },
      { name: 'Pyrecannon', count: 1 },
    ])
  })

  it('round-trips two specialists with the same nested choice', () => {
    const built = buildUnit('squad', index, 10, undefined, {
      spreads: { [key]: { 'heavy-bolter': 2, pyrecannon: 0 } },
    })!
    const choice = built.choices.find((candidate) => candidate.key === key)
    expect(choice?.options.find((option) => option.id === 'heavy-bolter')?.count).toBe(2)
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Heavy bolter', count: 2 })
  })
})

describe('laying counts over a selection', () => {
  const tree = { id: 'squad', count: 1, selections: [{ id: 'troopers', count: 1, selections: [{ id: 'trooper', count: 1 }] }] }

  it('sets the count at the end of the path', () => {
    const result = withCounts(tree, [{ path: ['troopers', 'trooper'], count: 9 }])
    expect(result.selections?.[0]?.selections?.[0]?.count).toBe(9)
  })

  it('creates the nodes a path names but the tree lacks', () => {
    const result = withCounts({ id: 'squad', count: 1 }, [{ path: ['troopers', 'trooper'], count: 5 }])
    expect(result.selections?.[0]?.selections?.[0]).toEqual({ id: 'trooper', count: 5 })
  })

  it('leaves siblings alone', () => {
    const withSergeant = { ...tree, selections: [...tree.selections, { id: 'sergeant', count: 1 }] }
    const result = withCounts(withSergeant, [{ path: ['troopers', 'trooper'], count: 9 }])
    expect(result.selections?.find((child) => child.id === 'sergeant')?.count).toBe(1)
  })
})

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

  it('clamps a size the data does not allow', () => {
    expect(buildUnit('squad', indexOf(squad()), 99)?.size.models).toBe(10)
  })

  it('treats a lone character as one model', () => {
    const index = indexOf({ sharedSelectionEntries: [{ id: 'captain', name: 'Captain', type: 'model' }] })
    expect(unitSize('captain', index)).toMatchObject({ min: 1, max: 1, models: 1 })
  })
})

/** An enhancement group: optional, one at most, and only inside its own faction. */
const keyworded = (): Partial<Catalogue> => ({
  sharedSelectionEntries: [
    {
      id: 'captain',
      name: 'Captain',
      type: 'model',
      categoryLinks: [{ id: 'cat-link', targetId: 'faction' }],
      selectionEntryGroups: [
        {
          id: 'enhancements',
          name: 'Enhancements',
          constraints: [{ id: 'enh-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
          selectionEntries: [
            { id: 'relic', name: 'Relic', type: 'upgrade' },
            { id: 'banner', name: 'Banner', type: 'upgrade' },
          ],
        },
      ],
    },
    {
      id: 'grunt',
      name: 'Grunt',
      type: 'model',
      selectionEntryGroups: [
        {
          id: 'enhancements-2',
          name: 'Enhancements',
          constraints: [{ id: 'enh-max-2', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
          selectionEntries: [
            {
              id: 'relic-2',
              name: 'Relic',
              type: 'upgrade',
              // Hidden unless the holder carries the faction keyword.
              modifiers: [
                {
                  type: 'set',
                  field: 'hidden',
                  value: true,
                  conditions: [{ type: 'notInstanceOf', value: 1, field: 'selections', scope: 'ancestor', childId: 'faction' }],
                },
              ],
            },
            { id: 'banner-2', name: 'Banner', type: 'upgrade' },
          ],
        },
      ],
    },
  ],
})

describe('options the data restricts by keyword', () => {
  const catalogue = keyworded

  it('offers an optional group as a choice nothing is taken in yet', () => {
    const index = indexOf(catalogue())
    const built = buildUnit('captain', index)!
    expect(built.choices.map((choice) => ({ name: choice.name, chosen: choice.chosen, optional: choice.optional }))).toEqual([
      { name: 'Enhancements', chosen: '', optional: true },
    ])
  })

  it('withholds an option from a holder that lacks the keyword', () => {
    const index = indexOf(catalogue())
    const built = buildUnit('grunt', index)!
    // Only one option survives, so there is no longer a choice to offer.
    expect(built.choices).toEqual([])
  })

  it('takes an option and can put it back', () => {
    const index = indexOf(catalogue())
    const built = buildUnit('captain', index)!
    const [choice] = built.choices
    if (!choice) throw new Error('the captain should be offered an enhancement')
    const taken = withChoice(built.selection, choice.key, 'relic', index)
    expect(unitChoices('captain', taken, index)[0]?.chosen).toBe('relic')
  })

  it('declines an optional choice by emptying it', () => {
    const index = indexOf(catalogue())
    const built = buildUnit('captain', index)!
    const [choice] = built.choices
    if (!choice) throw new Error('the captain should be offered an enhancement')
    const taken = withChoice(built.selection, choice.key, 'relic', index)
    const declined = withChoice(taken, choice.key, '', index)
    expect(unitChoices('captain', declined, index)[0]?.chosen).toBe('')
  })
})

it('does not offer mandatory weapons as alternatives to each other', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'soldier',
        name: 'Soldier',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'weapons',
            name: 'Weapons',
            selectionEntries: [
              {
                id: 'rifle',
                name: 'Rifle',
                type: 'upgrade',
                constraints: [{ id: 'rifle-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
              },
              {
                id: 'combat-weapon',
                name: 'Close combat weapon',
                type: 'upgrade',
                constraints: [{ id: 'combat-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    ],
  })
  const built = buildUnit('soldier', index)!

  expect(built.choices).toEqual([])
})

describe('the wargear a unit is carrying', () => {
  it('names each leaf upgrade with how many of it there are', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            { id: 'rifle', name: 'Gauss blaster', type: 'upgrade' },
            { id: 'fist', name: 'Close combat weapon', type: 'upgrade' },
          ],
        },
      ],
    })
    const selection = {
      id: 'squad',
      selections: [
        { id: 'rifle', count: 5 },
        { id: 'fist', count: 5 },
      ],
    }
    expect(wargearOf(selection, index)).toEqual([
      { name: 'Gauss blaster', count: 5 },
      { name: 'Close combat weapon', count: 5 },
    ])
  })

  it('leaves out an upgrade that only holds other upgrades', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          selectionEntries: [
            {
              id: 'ranged',
              name: 'Ranged weapons',
              type: 'upgrade',
              selectionEntries: [{ id: 'bolt', name: 'Bolt rifle', type: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const selection = { id: 'captain', selections: [{ id: 'ranged', selections: [{ id: 'bolt', count: 1 }] }] }
    expect(wargearOf(selection, index)).toEqual([{ name: 'Bolt rifle', count: 1 }])
  })

  it('multiplies a weapon by the models carrying it', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            { id: 'body', name: 'Immortal', type: 'model', selectionEntries: [{ id: 'gun', name: 'Gauss blaster', type: 'upgrade' }] },
          ],
        },
      ],
    })
    // What buildUnit produces: the count is on the model, and one gun per model.
    const selection = { id: 'squad', selections: [{ id: 'body', count: 5, selections: [{ id: 'gun', count: 1 }] }] }
    expect(wargearOf(selection, index)).toEqual([{ name: 'Gauss blaster', count: 5 }])
  })

  it('adds up the same weapon reached by more than one route', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            { id: 'sarge', name: 'Sergeant', type: 'model', selectionEntries: [{ id: 'pistol', name: 'Bolt pistol', type: 'upgrade' }] },
            { id: 'trooper', name: 'Trooper', type: 'model', selectionEntries: [{ id: 'pistol2', name: 'Bolt pistol', type: 'upgrade' }] },
          ],
        },
      ],
    })
    const selection = {
      id: 'squad',
      selections: [
        { id: 'sarge', count: 1, selections: [{ id: 'pistol', count: 1 }] },
        { id: 'trooper', count: 4, selections: [{ id: 'pistol2', count: 1 }] },
      ],
    }
    expect(wargearOf(selection, index)).toEqual([{ name: 'Bolt pistol', count: 5 }])
  })

  it('says nothing for a unit carrying nothing', () => {
    const index = indexOf({ sharedSelectionEntries: [{ id: 'blob', name: 'Blob', type: 'unit' }] })
    expect(wargearOf({ id: 'blob' }, index)).toEqual([])
  })

  it('leaves roster toggles and zero-count upgrades out of wargear', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'unit',
          selectionEntries: [
            { id: 'warlord', name: 'Warlord', type: 'upgrade' },
            { id: 'rifle', name: 'Bolt rifle', type: 'upgrade' },
          ],
        },
      ],
    })
    const selection = {
      id: 'captain',
      selections: [
        { id: 'warlord', count: 1 },
        { id: 'rifle', count: 0 },
      ],
    }
    expect(wargearOf(selection, index)).toEqual([])
  })
})

/** The weapon counts under the first model of the first unit, as ids and numbers. */
const weaponCounts = (selection: Selection) =>
  (selection.selections?.[0]?.selections?.[0]?.selections ?? []).map((held) => [held.id, held.count])

describe('a group a squad divides between options', () => {
  const squad = {
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Immortals',
        type: 'unit' as const,
        selectionEntries: [
          {
            id: 'body',
            name: 'Immortal',
            type: 'model' as const,
            constraints: [{ id: 'body-min', type: 'min' as const, value: 5, field: 'selections', scope: 'parent' }],
            selectionEntryGroups: [
              {
                id: 'guns',
                name: 'Weapons',
                defaultSelectionEntryId: 'blaster',
                constraints: [{ id: 'guns-max', type: 'max' as const, value: 5, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  { id: 'blaster', name: 'Gauss blaster', type: 'upgrade' as const },
                  { id: 'carbine', name: 'Tesla carbine', type: 'upgrade' as const },
                ],
              },
            ],
          },
        ],
      },
    ],
  }

  it('is reported with the room it has, not as a single choice', () => {
    const index = indexOf(squad)
    const built = buildUnit('squad', index)!
    const guns = built.choices.find((choice) => choice.name === 'Weapons')
    expect(guns?.room).toBe(5)
  })

  it('reports how many of each option is held', () => {
    const index = indexOf(squad)
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'body/guns': { blaster: 3, carbine: 2 } } })!
    const guns = built.choices.find((choice) => choice.name === 'Weapons')
    expect(guns?.options.map((option) => [option.name, option.count])).toEqual([
      ['Gauss blaster', 3],
      ['Tesla carbine', 2],
    ])
  })

  it('keeps both options standing, where choosing one empties the other', () => {
    const index = indexOf(squad)
    const spread = withSpread(defaultSelection('squad', index)!, 'body/guns', { blaster: 3, carbine: 2 })
    const chosen = withChoice(defaultSelection('squad', index)!, 'body/guns', 'carbine', index)
    const counts = weaponCounts
    expect(counts(spread)).toEqual([
      ['blaster', 3],
      ['carbine', 2],
    ])
    expect(counts(chosen)).toEqual([['carbine', 1]])
  })

  it('prices what the spread actually holds', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'body',
              name: 'Body',
              type: 'model',
              constraints: [{ id: 'body-min', type: 'min', value: 2, field: 'selections', scope: 'parent' }],
              selectionEntryGroups: [
                {
                  id: 'guns',
                  name: 'Weapons',
                  constraints: [{ id: 'guns-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                  selectionEntries: [
                    { id: 'cheap', name: 'Cheap gun', type: 'upgrade', costs: [{ name: 'pts', typeId: PTS, value: 5 }] },
                    { id: 'dear', name: 'Dear gun', type: 'upgrade', costs: [{ name: 'pts', typeId: PTS, value: 20 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'body/guns': { cheap: 1, dear: 1 } } })!
    expect(evaluate([built.selection], index).points).toBe(25)
  })
})

describe('per-model wargear when a squad changes size', () => {
  const squad = (weaponCost: number | null) => ({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit' as const,
        selectionEntries: [
          {
            id: 'body',
            name: 'Trooper',
            type: 'model' as const,
            constraints: [
              { id: 'body-min', type: 'min' as const, value: 5, field: 'selections', scope: 'parent' },
              { id: 'body-max', type: 'max' as const, value: 10, field: 'selections', scope: 'parent' },
            ],
            selectionEntryGroups: [
              {
                id: 'guns',
                name: 'Weapons',
                defaultSelectionEntryId: 'blaster',
                constraints: [
                  { id: 'guns-min', type: 'min' as const, value: 1, field: 'selections', scope: 'parent' },
                  { id: 'guns-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  { id: 'blaster', name: 'Blaster', type: 'upgrade' as const, collective: true },
                  {
                    id: 'carbine',
                    name: 'Carbine',
                    type: 'upgrade' as const,
                    collective: true,
                    ...(weaponCost === null ? {} : { costs: [{ name: 'pts', typeId: PTS, value: weaponCost }] }),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  it('gives every model one, however many there are', () => {
    const index = indexOf(squad(null))
    const built = buildUnit('squad', index, 8)!
    expect(wargearOf(built.selection, index)).toEqual([{ name: 'Blaster', count: 8 }])
  })

  it('leaves a split alone and tops it up to the models present', () => {
    const index = indexOf(squad(null))
    const built = buildUnit('squad', index, 10, undefined, { spreads: { 'body/guns': { carbine: 2 } } })!
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Blaster', count: 8 },
      { name: 'Carbine', count: 2 },
    ])
  })

  it('tops up with the option the data names, not the dearest', () => {
    const index = indexOf(squad(15))
    const built = buildUnit('squad', index, 6)!
    expect(evaluate([built.selection], index).points).toBe(0)
  })

  it('reports the group capacity as the models holding it', () => {
    const index = indexOf(squad(null))
    const built = buildUnit('squad', index, 7)!
    const choice = built.choices.find((candidate) => candidate.name === 'Weapons')
    expect(choice?.room).toBe(7)
    expect(choice?.options.map(({ count, max }) => ({ count, max }))).toEqual([
      { count: 7, max: 7 },
      { count: 0, max: 7 },
    ])
  })
})
