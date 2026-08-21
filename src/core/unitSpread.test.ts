import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate, type Selection } from './evaluate'
import { defaultSelection, withChoice } from './expand'
import { buildUnit } from './roster'
import { withSpread } from './selection'
import { modelCountOf } from './unitSize'
import { wargearOf } from './wargear'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const mandatory = (id: string) => [{ id, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }]

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

it('expands mandatory wargear when a squad spreads between model variants', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Heavy squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'models',
            name: '1-3 models',
            defaultSelectionEntryId: 'rifle-model',
            constraints: [
              { id: 'models-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 3, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'rifle-model',
                name: 'Model with rifle',
                type: 'model',
                selectionEntries: [
                  {
                    id: 'rifle',
                    name: 'Rifle',
                    type: 'upgrade',
                    constraints: [{ id: 'rifle-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                  {
                    id: 'blade',
                    name: 'Close combat weapon',
                    type: 'upgrade',
                    constraints: [{ id: 'blade-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
              {
                id: 'cannon-model',
                name: 'Model with cannon',
                type: 'model',
                selectionEntries: [
                  {
                    id: 'cannon',
                    name: 'Cannon',
                    type: 'upgrade',
                    constraints: [{ id: 'cannon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                  {
                    id: 'blade-2',
                    name: 'Close combat weapon',
                    type: 'upgrade',
                    constraints: [{ id: 'blade-2-min', type: 'min', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  const built = buildUnit('squad', index, 1, undefined, { spreads: { models: { 'rifle-model': 0, 'cannon-model': 1 } } })!
  expect(wargearOf(built.selection, index)).toEqual([
    { name: 'Cannon', count: 1 },
    { name: 'Close combat weapon', count: 1 },
  ])
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

describe('a squad that both divides itself and arms a specialist', () => {
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
            defaultSelectionEntryId: 'rifleman',
            constraints: [
              { id: 'models-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'rifleman',
                name: 'Veteran w/ Rifle',
                type: 'model',
                constraints: [{ id: 'rifleman-max', type: 'max', value: 9, field: 'selections', scope: 'parent' }],
                selectionEntries: [{ id: 'rifle', name: 'Rifle', type: 'upgrade', constraints: mandatory('rifle-min') }],
              },
              {
                id: 'combi',
                name: 'Veteran w/ Combi-weapon',
                type: 'model',
                constraints: [{ id: 'combi-max', type: 'max', value: 9, field: 'selections', scope: 'parent' }],
                selectionEntries: [{ id: 'combi-weapon', name: 'Combi-weapon', type: 'upgrade', constraints: mandatory('combi-min') }],
              },
              {
                id: 'gunner',
                name: 'Veteran w/ Special Weapon',
                type: 'model',
                constraints: [{ id: 'gunner-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                selectionEntryGroups: [
                  {
                    id: 'heavy-weapon',
                    name: 'Heavy weapon',
                    constraints: [
                      { id: 'heavy-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'heavy-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [{ id: 'pyrecannon', name: 'Pyrecannon', type: 'upgrade' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  const weapon = 'models/gunner/heavy-weapon'
  const held = (spreads: Record<string, Record<string, number>>) => {
    const built = buildUnit('squad', index, 10, undefined, { spreads })!
    return { models: modelCountOf(built.selection, index), wargear: wargearOf(built.selection, index) }
  }

  /**
   * The specialist's body has to come from somewhere, and taking it from whichever
   * option happens to hold the most took it from the combi-weapons the player had
   * just asked for — then handed the body back to the rifles, so the squad quietly
   * refused to hold more than about half its combi-weapons.
   */
  it('keeps every weapon the player asked for while a specialist is armed', () => {
    expect(held({ models: { rifleman: 3, combi: 5 }, [weapon]: { pyrecannon: 1 } })).toEqual({
      models: 10,
      wargear: [
        { name: 'Pyrecannon', count: 1 },
        { name: 'Rifle', count: 4 },
        { name: 'Combi-weapon', count: 5 },
      ],
    })
  })

  it('leaves the squad the same whichever request the list names first', () => {
    const spreads = { models: { rifleman: 2, combi: 5 }, [weapon]: { pyrecannon: 2 } }
    expect(held(spreads)).toEqual(held(Object.fromEntries(Object.entries(spreads).toReversed())))
  })
})

/**
 * A catalogue with no unit profile on its models has only the entry names to say
 * which of them are the same kind of model — and it files one entry per weapon, so
 * ten warriors arrive as a warrior with a gauss flayer beside a warrior with a gauss
 * reaper. Read literally that is two kinds of model, drawn as a card each and then
 * asked for a second time as a wargear option underneath.
 */

describe('a group with nothing in it yet', () => {
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
              { id: 'models-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 5, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper w/ rifle',
                type: 'model',
                selectionEntries: [{ id: 'rifle', name: 'Rifle', type: 'upgrade', constraints: mandatory('rifle-min') }],
              },
            ],
            selectionEntryGroups: [
              {
                id: 'heavies',
                name: 'Heavy weapons',
                constraints: [{ id: 'heavies-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  {
                    id: 'gunner',
                    name: 'Trooper w/ heavy bolter',
                    type: 'model',
                    constraints: [{ id: 'gunner-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                    selectionEntries: [{ id: 'bolter', name: 'Heavy bolter', type: 'upgrade', constraints: mandatory('bolter-min') }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  const held = (spreads: Record<string, Record<string, number>>) => {
    const built = buildUnit('squad', index, undefined, undefined, { spreads })!
    return { models: modelCountOf(built.selection, index), wargear: wargearOf(built.selection, index) }
  }

  it('is reached by the request that puts the first model in it', () => {
    expect(held({ 'models/heavies': { gunner: 1 }, models: { trooper: 4 } })).toEqual({
      models: 5,
      wargear: [
        { name: 'Heavy bolter', count: 1 },
        { name: 'Rifle', count: 4 },
      ],
    })
  })

  it('offers the model it holds once it has been reached', () => {
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'models/heavies': { gunner: 1 }, models: { trooper: 4 } } })!
    const heavies = built.choices.find((choice) => choice.name === 'Heavy weapons')
    expect(heavies?.options.map((option) => [option.name, option.count])).toEqual([['Trooper w/ heavy bolter', 1]])
  })

  it('is left out of the selection while nothing is asked of it', () => {
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'models/heavies': { gunner: 0 } } })!
    expect(built.selection.selections?.[0]?.selections?.map((child) => child.id)).toEqual(['trooper'])
  })
})

/**
 * The carrier can be as absent as the group it holds. A squad arming its first flamer
 * has neither the flamer nor the biker to hang it on, and the request that would put
 * both there went nowhere for the same reason: the group the biker stands in was not
 * in the tree to be stood in.
 */

describe('a specialist the squad does not have yet', () => {
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
              { id: 'models-min', type: 'min', value: 4, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 4, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'trooper',
                name: 'Trooper',
                type: 'model',
                selectionEntries: [{ id: 'rifle', name: 'Rifle', type: 'upgrade', constraints: mandatory('rifle-min') }],
              },
            ],
            selectionEntryGroups: [
              {
                id: 'specialists',
                name: 'Specialists',
                constraints: [{ id: 'specialists-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  {
                    id: 'gunner',
                    name: 'Trooper w/ special weapon',
                    type: 'model',
                    constraints: [{ id: 'gunner-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                    selectionEntryGroups: [
                      {
                        id: 'special',
                        name: 'Special weapon',
                        constraints: [
                          { id: 'special-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                          { id: 'special-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                        ],
                        selectionEntries: [
                          { id: 'flamer', name: 'Flamer', type: 'upgrade' },
                          { id: 'melta', name: 'Meltagun', type: 'upgrade' },
                        ],
                      },
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

  it('is brought in by the request that arms it, at a squadmate’s expense', () => {
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'models/specialists/gunner/special': { flamer: 1 } } })!
    expect({ models: modelCountOf(built.selection, index), wargear: wargearOf(built.selection, index) }).toEqual({
      models: 4,
      wargear: [
        { name: 'Rifle', count: 3 },
        { name: 'Flamer', count: 1 },
      ],
    })
  })

  it('hands the body back when its weapon is put down', () => {
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'models/specialists/gunner/special': { flamer: 0 } } })!
    expect({ models: modelCountOf(built.selection, index), wargear: wargearOf(built.selection, index) }).toEqual({
      models: 4,
      wargear: [{ name: 'Rifle', count: 4 }],
    })
  })
})

/**
 * How many models a squad fields is the size its player set, and asking for a weapon
 * is not asking for that to change. A meltagun is one of the five Plague Marines
 * carrying it, not a sixth marine — but a drone or a plasmacyte is filed outside the
 * group the squad's size is counted in, because it is an addition rather than one of
 * the squad, and taking one does make the unit bigger.
 */

describe('a weapon request beside a squad that may still grow', () => {
  const squad = (extras: { inside: boolean }) => {
    const specialists = {
      id: 'specialists',
      name: 'Special weapons',
      constraints: [{ id: 'specialists-max', type: 'max' as const, value: 2, field: 'selections', scope: 'parent' }],
      selectionEntries: [
        {
          id: 'gunner',
          name: 'Trooper w/ meltagun',
          type: 'model' as const,
          constraints: [{ id: 'gunner-max', type: 'max' as const, value: 2, field: 'selections', scope: 'parent' }],
          selectionEntries: [{ id: 'melta', name: 'Meltagun', type: 'upgrade' as const, constraints: mandatory('melta-min') }],
        },
      ],
    }
    return indexOf({
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
                { id: 'models-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
                { id: 'models-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
              ],
              selectionEntries: [
                {
                  id: 'trooper',
                  name: 'Trooper',
                  type: 'model',
                  selectionEntries: [{ id: 'rifle', name: 'Rifle', type: 'upgrade', constraints: mandatory('rifle-min') }],
                },
              ],
              ...(extras.inside ? { selectionEntryGroups: [specialists] } : {}),
            },
            ...(extras.inside ? [] : [specialists]),
          ],
        },
      ],
    })
  }

  const armed = (index: ReturnType<typeof indexOf>, key: string) => {
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { [key]: { gunner: 1 } } })!
    return { models: modelCountOf(built.selection, index), wargear: wargearOf(built.selection, index) }
  }

  /** The group is inside the one the squad's size is counted in: a swap, as the datasheet says. */
  it('costs a squadmate their place where the model joins the squad', () => {
    expect(armed(squad({ inside: true }), 'models/specialists')).toEqual({
      models: 5,
      wargear: [
        { name: 'Rifle', count: 4 },
        { name: 'Meltagun', count: 1 },
      ],
    })
  })

  /** Filed beside the squad rather than in it: an addition, the way a drone is. */
  it('adds to a unit where the model stands beside the squad', () => {
    expect(armed(squad({ inside: false }), 'specialists')).toEqual({
      models: 6,
      wargear: [
        { name: 'Rifle', count: 5 },
        { name: 'Meltagun', count: 1 },
      ],
    })
  })

  it('hands the place back when the weapon is put down again', () => {
    const index = squad({ inside: true })
    const built = buildUnit('squad', index, undefined, undefined, { spreads: { 'models/specialists': { gunner: 0 } } })!
    expect({ models: modelCountOf(built.selection, index), wargear: wargearOf(built.selection, index) }).toEqual({
      models: 5,
      wargear: [{ name: 'Rifle', count: 5 }],
    })
  })
})
