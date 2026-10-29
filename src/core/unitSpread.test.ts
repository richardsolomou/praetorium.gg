import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile, type CatalogueIndex } from './catalogue'
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
                constraints: [{ id: 'guns-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' }],
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

  const twoGuns = () =>
    indexOf({
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
  const spreadOverTwo = (index: ReturnType<typeof twoGuns>) =>
    buildUnit('squad', index, undefined, undefined, { spreads: { 'body/guns': { cheap: 1, dear: 1 } } })!.selection

  it('prices what the spread actually holds', () => {
    const index = twoGuns()
    expect(evaluate([spreadOverTwo(index)], index).points).toBe(25)
  })

  it('lists the same wargear it prices', () => {
    const index = twoGuns()
    expect(wargearOf(spreadOverTwo(index), index)).toEqual([
      { name: 'Cheap gun', count: 1 },
      { name: 'Dear gun', count: 1 },
    ])
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

describe('a group each model takes two picks from', () => {
  const pair = (id: string) => [{ id: `${id}-max`, type: 'max' as const, value: 2, field: 'selections', scope: 'parent' }]
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'suits',
        name: 'Suits',
        type: 'unit' as const,
        selectionEntries: [
          {
            id: 'suit',
            name: 'Suit',
            type: 'model' as const,
            constraints: [
              { id: 'suit-min', type: 'min' as const, value: 2, field: 'selections', scope: 'parent' },
              { id: 'suit-max', type: 'max' as const, value: 2, field: 'selections', scope: 'parent' },
            ],
            selectionEntryGroups: [
              {
                id: 'guns',
                name: 'Weapons',
                constraints: [{ id: 'guns-min', type: 'min' as const, value: 2, field: 'selections', scope: 'parent' }, ...pair('guns')],
                selectionEntries: [
                  { id: 'cannon', name: 'Cannon', type: 'upgrade' as const, constraints: pair('cannon') },
                  { id: 'flamer', name: 'Flamer', type: 'upgrade' as const, constraints: pair('flamer') },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  it('arms each model fully when the split crosses models', () => {
    const built = buildUnit('suits', index, 2, undefined, { spreads: { 'suit/guns': { cannon: 3, flamer: 1 } } })!
    expect({ wargear: wargearOf(built.selection, index), errors: evaluate([built.selection], index).errors }).toEqual({
      wargear: [
        { name: 'Cannon', count: 3 },
        { name: 'Flamer', count: 1 },
      ],
      errors: [],
    })
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

  it('takes an unallocated specialist body from the default model', () => {
    expect(held({ models: { rifleman: 4, combi: 6 }, [weapon]: { pyrecannon: 1 } })).toEqual({
      models: 10,
      wargear: [
        { name: 'Pyrecannon', count: 1 },
        { name: 'Rifle', count: 3 },
        { name: 'Combi-weapon', count: 6 },
      ],
    })
  })

  it('leaves the squad the same whichever request the list names first', () => {
    const spreads = { models: { rifleman: 2, combi: 5 }, [weapon]: { pyrecannon: 2 } }
    expect(held(spreads)).toEqual(held(Object.fromEntries(Object.entries(spreads).toReversed())))
  })
})

describe('specialists in a squad of fixed size', () => {
  // A Pathfinder Team is always nine Pathfinders: three may take special weapons and one
  // a grenade launcher, and the carbines' minimum makes room for them.
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'team',
        name: 'Pathfinder Team',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'pathfinders',
            name: 'Pathfinders',
            constraints: [
              { id: 'pathfinders-min', type: 'min', value: 9, field: 'selections', scope: 'parent' },
              { id: 'pathfinders-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'carbine',
                name: 'Pathfinders w/ pulse carbine',
                type: 'model',
                constraints: [
                  { id: 'carbine-min', type: 'min', value: 9, field: 'selections', scope: 'parent' },
                  { id: 'carbine-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
                ],
                modifiers: [
                  { type: 'decrement', field: 'carbine-min', value: 3 },
                  {
                    type: 'decrement',
                    field: 'carbine-min',
                    value: 1,
                    conditions: [
                      {
                        type: 'greaterThan',
                        value: 0,
                        field: 'selections',
                        scope: 'parent',
                        childId: 'launcher',
                        includeChildSelections: true,
                      },
                    ],
                  },
                ],
              },
              {
                id: 'launcher',
                name: 'Pathfinders w/ pulse carbine and grenade launcher',
                type: 'model',
                constraints: [{ id: 'launcher-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
            selectionEntryGroups: [
              {
                id: 'specials',
                name: 'Special Weapons (0-3)',
                constraints: [{ id: 'specials-max', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  {
                    id: 'rail',
                    name: 'Pathfinders w/ rail rifle',
                    type: 'model',
                    constraints: [{ id: 'rail-max', type: 'max', value: 3, field: 'selections', scope: 'parent' }],
                    selectionEntries: [{ id: 'rail-rifle', name: 'Rail rifle', type: 'upgrade', constraints: mandatory('rail-rifle-min') }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  it('arms every special weapon asked for', () => {
    const built = buildUnit('team', index, 9, undefined, { spreads: { 'pathfinders/specials': { rail: 3 } } })!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Rail rifle', count: 3 })
  })

  it('offers the grenade launcher the carbines make room for', () => {
    const launcher = buildUnit('team', index, 9)!
      .choices.flatMap((choice) => choice.options)
      .find((option) => option.id === 'launcher')
    expect(launcher?.max).toBe(1)
  })
})

describe('a specialist joining a squad whose default models are split', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'suits',
        name: 'Stealth Battlesuits',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'shasui',
            name: '4 Stealth Shas’ui',
            defaultSelectionEntryId: 'burst',
            constraints: [
              { id: 'shasui-min', type: 'min', value: 4, field: 'selections', scope: 'parent' },
              { id: 'shasui-max', type: 'max', value: 4, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'burst',
                name: 'Stealth Shas’ui w/ burst cannon',
                type: 'model',
                constraints: [
                  { id: 'burst-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                  { id: 'burst-max', type: 'max', value: 4, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  { id: 'burst-cannon', name: 'Burst cannon', type: 'upgrade', constraints: mandatory('burst-cannon-min') },
                  { id: 'beacon', name: 'Homing beacon', type: 'upgrade' },
                ],
              },
              {
                id: 'fusion',
                name: 'Stealth Shas’ui w/ fusion blaster',
                type: 'model',
                constraints: [{ id: 'fusion-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  { id: 'fusion-blaster', name: 'Fusion blaster', type: 'upgrade', constraints: mandatory('fusion-min') },
                  { id: 'fusion-beacon', name: 'Homing beacon', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  it('takes its bodies from every copy of the default model', () => {
    const built = buildUnit('suits', index, 4, undefined, { spreads: { shasui: { fusion: 2 }, 'shasui/burst/beacon': { beacon: 1 } } })!
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Burst cannon', count: 2 },
      { name: 'Homing beacon', count: 1 },
      { name: 'Fusion blaster', count: 2 },
    ])
  })

  it('fields the specialists counted when their own upgrade is asked for none', () => {
    const built = buildUnit('suits', index, 4, undefined, {
      spreads: { shasui: { fusion: 2 }, 'shasui/fusion/fusion-beacon': { 'fusion-beacon': 0 } },
    })!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Fusion blaster', count: 2 })
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
                constraints: [{ id: 'trooper-min', type: 'min', value: 2, field: 'selections', scope: 'parent' }],
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

describe('a loadout with nested weapon choices', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntries: [
          {
            id: 'leader',
            name: 'Leader',
            type: 'model',
            constraints: [...mandatory('leader-min'), { id: 'leader-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
            selectionEntryGroups: [
              {
                id: 'loadout',
                name: 'Loadout',
                defaultSelectionEntryId: 'pair',
                constraints: [
                  ...mandatory('loadout-min'),
                  { id: 'loadout-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  {
                    id: 'pair',
                    name: 'Blade and gun',
                    type: 'upgrade',
                    selectionEntries: [{ id: 'blade', name: 'Blade', type: 'upgrade', constraints: mandatory('blade-min') }],
                    selectionEntryGroups: [
                      {
                        id: 'gun',
                        name: 'Gun',
                        defaultSelectionEntryId: 'pistol',
                        constraints: [
                          ...mandatory('gun-min'),
                          { id: 'gun-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                        ],
                        selectionEntries: [
                          { id: 'pistol', name: 'Pistol', type: 'upgrade' },
                          { id: 'rifle', name: 'Rifle', type: 'upgrade' },
                        ],
                      },
                    ],
                  },
                  { id: 'axe', name: 'Axe', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  const held = (spreads: Record<string, Record<string, number>>) =>
    wargearOf(buildUnit('squad', index, 1, undefined, { spreads })!.selection, index)
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(({ name, count }) => [name, count])

  it('restores a parent loadout while retaining its saved weapon choice', () => {
    expect(held({ 'leader/loadout': { pair: 1, axe: 0 }, 'leader/loadout/pair/gun': { pistol: 0, rifle: 1 } })).toEqual([
      ['Blade', 1],
      ['Rifle', 1],
    ])
  })

  it('keeps saved nested weapons out of a replaced loadout', () => {
    expect(held({ 'leader/loadout': { pair: 0, axe: 1 }, 'leader/loadout/pair/gun': { pistol: 0, rifle: 1 } })).toEqual([['Axe', 1]])
  })

  it('does not restore a nested weapon explicitly removed from the chosen loadout', () => {
    expect(held({ 'leader/loadout': { pair: 1, axe: 0 }, 'leader/loadout/pair/gun': { pistol: 0, rifle: 0 } })).toEqual([['Blade', 1]])
  })
})

describe('a specialist armed by a choice and counted by a spread', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Terminator Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'models',
            name: 'Terminators',
            defaultSelectionEntryId: 'fist',
            constraints: [
              { id: 'models-min', type: 'min', value: 5, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 5, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'fist',
                name: 'Terminator w/ Power Fist',
                type: 'model',
                constraints: [{ id: 'fist-max', type: 'max', value: 5, field: 'selections', scope: 'parent' }],
                selectionEntries: [{ id: 'power-fist', name: 'Power fist', type: 'upgrade', constraints: mandatory('fist-min') }],
              },
              {
                id: 'heavy',
                name: 'Terminator w/ Heavy Weapon',
                type: 'model',
                constraints: [{ id: 'heavy-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                selectionEntryGroups: [
                  {
                    id: 'heavy-weapon',
                    name: 'Heavy weapon',
                    constraints: [
                      { id: 'heavy-weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'heavy-weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [
                      { id: 'flamer', name: 'Heavy flamer', type: 'upgrade' },
                      {
                        id: 'cyclone',
                        name: 'Cyclone missile launcher',
                        type: 'upgrade',
                        costs: [{ name: 'pts', typeId: PTS, value: 10 }],
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

  it('keeps the chosen weapon when the spread already counts its model', () => {
    const built = buildUnit('squad', index, 5, { 'models/heavy/heavy-weapon': 'cyclone' }, { spreads: { models: { fist: 4, heavy: 1 } } })!
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Power fist', count: 4 },
      { name: 'Cyclone missile launcher', count: 1 },
    ])
  })
})

describe('a specialist that takes the place of a squadmate', () => {
  // Sanctifiers: a Sanctifier may swap his hand flamer for the simulacrum imperialis or a
  // second hand flamer, and the data says so by lowering the hand-flamer Sanctifiers' limits.
  // Skitarii Rangers write the same thing as a group of specialists beside the squadmates,
  // lowering their limits by whatever that group holds.
  const swapped = (limit: string, counted: readonly string[]) => ({
    type: 'decrement' as const,
    field: limit,
    value: 1,
    repeats: counted.map((childId) => ({
      childId,
      field: 'selections',
      scope: 'sanctifiers',
      value: 1,
      repeats: 1,
      includeChildSelections: true,
    })),
  })
  const armed = (id: string, weapon: string) => [
    { id: `${id}-${weapon}`, name: weapon, type: 'upgrade' as const, constraints: mandatory(`${id}-${weapon}-min`) },
  ]
  const squadmates = (counted: readonly string[]) => [
    {
      id: 'missionary',
      name: 'Missionary',
      type: 'model' as const,
      constraints: [
        { id: 'missionary-min', type: 'min' as const, value: 1, field: 'selections', scope: 'parent' },
        { id: 'missionary-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' },
      ],
    },
    {
      id: 'flamers',
      name: 'Sanctifier w/ hand flamer',
      type: 'model' as const,
      constraints: [
        { id: 'flamers-min', type: 'min' as const, value: 4, field: 'selections', scope: 'parent' },
        { id: 'flamers-max', type: 'max' as const, value: 4, field: 'selections', scope: 'parent' },
      ],
      modifiers: [swapped('flamers-min', counted), swapped('flamers-max', counted)],
      selectionEntries: armed('flamers', 'Hand flamer'),
    },
  ]
  const [simulacrum, twoFlamers, censer] = [
    ['simulacrum', 'Sanctifier w/ simulacrum imperialis', 'Simulacrum imperialis'],
    ['two-flamers', 'Sanctifier w/ two hand flamers', 'Two hand flamers'],
    ['censer', 'Sanctifier w/ censer', 'Censer'],
  ].map(([id, name, weapon]) => ({
    id: id!,
    name: name!,
    type: 'model' as const,
    constraints: [{ id: `${id}-max`, type: 'max' as const, value: 1, field: 'selections', scope: 'parent' }],
    selectionEntries: armed(id!, weapon!),
  }))
  const models = [...squadmates(['simulacrum', 'two-flamers']), simulacrum!, twoFlamers!]
  const shapes = {
    'on the datasheet': indexOf({
      sharedSelectionEntries: [{ id: 'sanctifiers', name: 'Sanctifiers', type: 'unit', selectionEntries: models }],
    }),
    'in a group': indexOf({
      sharedSelectionEntries: [
        {
          id: 'sanctifiers',
          name: 'Sanctifiers',
          type: 'unit',
          selectionEntryGroups: [{ id: 'squad', name: 'Sanctifiers', selectionEntries: models }],
        },
      ],
    }),
    'in a group beside the squad': indexOf({
      sharedSelectionEntries: [
        {
          id: 'sanctifiers',
          name: 'Sanctifiers',
          type: 'unit',
          selectionEntries: squadmates(['specialists']),
          selectionEntryGroups: [
            {
              id: 'specialists',
              name: 'Sanctifier options',
              selectionEntries: [simulacrum!, twoFlamers!],
              selectionEntryGroups: [
                {
                  id: 'either',
                  name: 'Either',
                  constraints: [{ id: 'either-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' }],
                  selectionEntries: [censer!],
                },
              ],
            },
          ],
        },
      ],
    }),
  }
  const taking = (index: CatalogueIndex, ...ids: string[]) => {
    const spreads: Record<string, Record<string, number>> = {}
    for (const id of ids) {
      const key = buildUnit('sanctifiers', index)!.choices.find((choice) => choice.options.some((option) => option.id === id))?.key
      if (key) spreads[key] = { ...spreads[key], [id]: 1 }
    }
    return buildUnit('sanctifiers', index, undefined, undefined, { spreads })!
  }

  it.each(Object.entries(shapes))('is offered %s', (_shape, index) => {
    const options = buildUnit('sanctifiers', index)!.choices.flatMap((choice) => choice.options)
    expect(options.find((option) => option.id === 'simulacrum')?.max).toBe(1)
  })

  it.each(Object.entries(shapes))('keeps the squad at its size when taken %s', (_shape, index) => {
    expect(modelCountOf(taking(index, 'simulacrum').selection, index)).toBe(5)
  })

  it.each(Object.entries(shapes))('takes the hand flamer of the squadmate it replaces %s', (_shape, index) => {
    expect(wargearOf(taking(index, 'simulacrum').selection, index)).toContainEqual({ name: 'Hand flamer', count: 3 })
  })

  it.each(Object.entries(shapes))('leaves the squad legal when taken %s', (_shape, index) => {
    expect(evaluate([taking(index, 'simulacrum').selection], index).errors).toEqual([])
  })

  it.each(Object.entries(shapes))('replaces a squadmate for each specialist taken %s', (_shape, index) => {
    expect(wargearOf(taking(index, 'simulacrum', 'two-flamers').selection, index)).toContainEqual({ name: 'Hand flamer', count: 2 })
  })

  it.each(Object.entries(shapes))('takes the place of a squadmate when chosen %s', (_shape, index) => {
    const key = buildUnit('sanctifiers', index)!.choices.find((choice) => choice.options.some((option) => option.id === 'simulacrum'))!.key
    const built = buildUnit('sanctifiers', index, undefined, { [key]: 'simulacrum' })!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Hand flamer', count: 3 })
  })

  it.each(Object.entries(shapes))('arms a specialist when chosen %s', (_shape, index) => {
    const key = buildUnit('sanctifiers', index)!.choices.find((choice) => choice.options.some((option) => option.id === 'simulacrum'))!.key
    const built = buildUnit('sanctifiers', index, undefined, { [key]: 'simulacrum' })!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Simulacrum imperialis', count: 1 })
  })

  it.each(Object.entries(shapes))('keeps the squad a fixed size once a specialist is taken %s', (_shape, index) => {
    expect(taking(index, 'simulacrum').size).toMatchObject({ min: 5, max: 5 })
  })

  it('takes the place of a squadmate from a group nested beside the squad', () => {
    const index = shapes['in a group beside the squad']
    expect(wargearOf(taking(index, 'simulacrum', 'censer').selection, index)).toContainEqual({ name: 'Hand flamer', count: 2 })
  })

  it('offers every specialist in a group beside the squad at once', () => {
    const choice = buildUnit('sanctifiers', shapes['in a group beside the squad'])!.choices.find((each) => each.key === 'specialists')
    expect(choice?.room).toBe(2)
  })
})

describe('a specialist in the second fixed group of a fixed-size unit', () => {
  // Talonstrike Kill Team: four Heavy Intercessors and five Intercessors, each a fixed
  // group whose default model gives up a place, by its limits, to each specialist taken.
  const specialistLowers = (limit: string, specialist: string) => ({
    type: 'decrement' as const,
    field: limit,
    value: 1,
    repeats: [{ childId: specialist, field: 'selections', scope: 'team', value: 1, repeats: 1, includeChildSelections: true }],
  })
  const fixedGroup = (id: string, size: number, specialistMost: number) => ({
    id,
    name: `${size} ${id}`,
    constraints: [
      { id: `${id}-min`, type: 'min' as const, value: size, field: 'selections', scope: 'parent' },
      { id: `${id}-max`, type: 'max' as const, value: size, field: 'selections', scope: 'parent' },
    ],
    selectionEntries: [
      {
        id: `${id}-trooper`,
        name: `${id} trooper`,
        type: 'model' as const,
        constraints: [
          { id: `${id}-trooper-min`, type: 'min' as const, value: size, field: 'selections', scope: 'parent' },
          { id: `${id}-trooper-max`, type: 'max' as const, value: size, field: 'selections', scope: 'parent' },
        ],
        modifiers: [specialistLowers(`${id}-trooper-min`, `${id}-specialist`), specialistLowers(`${id}-trooper-max`, `${id}-specialist`)],
      },
      {
        id: `${id}-specialist`,
        name: `${id} specialist`,
        type: 'model' as const,
        constraints: [{ id: `${id}-specialist-max`, type: 'max' as const, value: specialistMost, field: 'selections', scope: 'parent' }],
      },
    ],
  })
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'team',
        name: 'Talonstrike Kill Team',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'composition',
            name: 'Unit Composition',
            selectionEntries: [
              {
                id: 'sergeant',
                name: 'Kill Team Sergeant',
                type: 'model',
                constraints: [
                  { id: 'sergeant-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                  { id: 'sergeant-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
              },
            ],
            selectionEntryGroups: [fixedGroup('heavy', 4, 4), fixedGroup('jump', 5, 2)],
          },
        ],
      },
    ],
  })

  it('offers the specialist of a fixed group the unit is not sized by', () => {
    const offered = buildUnit('team', index)!
      .choices.flatMap((choice) => choice.options)
      .find((option) => option.id === 'jump-specialist')
    expect(offered?.max).toBe(2)
  })
})

describe('specialists taking the places of squadmates holding a shared weapon group', () => {
  // Militarum Tempestus Command Squad: four Scions share one hot-shot lasgun capacity,
  // and a medic or standard bearer takes a Scion's place.
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'command',
        name: 'Command Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'scions',
            name: 'Scions',
            defaultSelectionEntryId: 'scion',
            constraints: [
              { id: 'scions-min', type: 'min', value: 4, field: 'selections', scope: 'parent' },
              { id: 'scions-max', type: 'max', value: 4, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'scion',
                name: 'Scion',
                type: 'model',
                constraints: [{ id: 'scion-max', type: 'max', value: 4, field: 'selections', scope: 'parent' }],
                selectionEntryGroups: [
                  {
                    id: 'guns',
                    name: 'Weapon',
                    defaultSelectionEntryId: 'lasgun',
                    constraints: [
                      { id: 'guns-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'guns-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [
                      { id: 'lasgun', name: 'Hot-shot lasgun', type: 'upgrade', collective: true },
                      {
                        id: 'plasma',
                        name: 'Plasma gun',
                        type: 'upgrade',
                        constraints: [{ id: 'plasma-max', type: 'max', value: 1, field: 'selections', scope: 'unit' }],
                      },
                      {
                        id: 'melta',
                        name: 'Meltagun',
                        type: 'upgrade',
                        constraints: [{ id: 'melta-max', type: 'max', value: 1, field: 'selections', scope: 'unit' }],
                      },
                    ],
                  },
                ],
              },
              {
                id: 'medic',
                name: 'Scion w/ Medi-pack',
                type: 'model',
                constraints: [{ id: 'medic-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  {
                    id: 'medic-lasgun',
                    name: 'Hot-shot lasgun',
                    type: 'upgrade',
                    constraints: [{ id: 'medic-lasgun-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
              {
                id: 'standard',
                name: 'Scion w/ Regimental Standard',
                type: 'model',
                constraints: [{ id: 'standard-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    ],
  })
  const guns = (built: { selection: Selection }) =>
    built.selection.selections
      ?.find((held) => held.id === 'scions')
      ?.selections?.find((held) => held.id === 'scion')
      ?.selections?.find((held) => held.id === 'guns')
      ?.selections?.map((held) => [held.id, held.count])

  it('gives up a lasgun with each Scion a chosen medic replaces', () => {
    const built = buildUnit(
      'command',
      index,
      undefined,
      { 'scions/medic/medic-lasgun': 'medic-lasgun' },
      { spreads: { scions: { scion: 3, medic: 1 } } },
    )!
    expect(guns(built)).toEqual([['lasgun', 3]])
  })

  it('keeps the special weapons of the Scions left after specialists join', () => {
    const spreads = { scions: { scion: 2, standard: 1, medic: 1 }, 'scions/scion/guns': { lasgun: 2, plasma: 1, melta: 1 } }
    expect(guns(buildUnit('command', index, undefined, undefined, { spreads })!)).toEqual([
      ['plasma', 1],
      ['melta', 1],
    ])
  })

  it('fits weapons counted for more Scions than a chosen medic leaves', () => {
    const choices = { 'scions/medic/medic-lasgun': 'medic-lasgun' }
    const spreads = { scions: { scion: 3, medic: 1 }, 'scions/scion/guns': { lasgun: 2, plasma: 1, melta: 1 } }
    expect(guns(buildUnit('command', index, undefined, choices, { spreads })!)).toEqual([
      ['lasgun', 1],
      ['plasma', 1],
      ['melta', 1],
    ])
  })
})

describe('per-model wargear on a model its group counts', () => {
  // Bullgryn Squad: the Bullgryn has no count of its own; "2-5 Bullgryns" holds it.
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Bullgryn Squad',
        type: 'unit',
        selectionEntries: [
          {
            id: 'boss',
            name: "Bone 'ead",
            type: 'model',
            constraints: [...mandatory('boss-min'), { id: 'boss-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
          },
        ],
        selectionEntryGroups: [
          {
            id: 'bodies',
            name: '2-5 Bullgryns',
            defaultSelectionEntryId: 'body',
            constraints: [
              { id: 'bodies-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
              { id: 'bodies-max', type: 'max', value: 5, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'body',
                name: 'Bullgryn',
                type: 'model',
                selectionEntryGroups: [
                  {
                    id: 'shield',
                    name: 'Shield',
                    defaultSelectionEntryId: 'slab',
                    constraints: [
                      { id: 'shield-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'shield-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [
                      { id: 'slab', name: 'Slabshield', type: 'upgrade' },
                      { id: 'brute', name: 'Brute shield', type: 'upgrade' },
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

  it('lets every model take its own option', () => {
    const shield = buildUnit('squad', index)!.choices.find((choice) => choice.name === 'Shield')
    expect(shield?.options.map((option) => [option.name, option.max])).toEqual([
      ['Slabshield', 2],
      ['Brute shield', 2],
    ])
  })

  const shields = (models: number, spread: Record<string, number>) =>
    wargearOf(buildUnit('squad', index, models, undefined, { spreads: { 'bodies/body/shield': spread } })!.selection, index).toSorted(
      (left, right) => left.name.localeCompare(right.name),
    )

  it('keeps a split and tops it up when the squad grows', () => {
    expect(shields(6, { brute: 1, slab: 1 })).toEqual([
      { name: 'Brute shield', count: 1 },
      { name: 'Slabshield', count: 4 },
    ])
  })

  it('gives up the default option first when the squad shrinks', () => {
    expect(shields(3, { slab: 4, brute: 1 })).toEqual([
      { name: 'Brute shield', count: 1 },
      { name: 'Slabshield', count: 1 },
    ])
  })
})

describe('a squad divided by one choice and then another', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Death Company',
        type: 'unit' as const,
        selectionEntries: [
          {
            id: 'marine',
            name: 'Marine',
            type: 'model' as const,
            constraints: [
              { id: 'marine-min', type: 'min' as const, value: 5, field: 'selections', scope: 'parent' },
              { id: 'marine-max', type: 'max' as const, value: 5, field: 'selections', scope: 'parent' },
            ],
            selectionEntryGroups: [
              {
                id: 'pistol',
                name: 'Pistol',
                defaultSelectionEntryId: 'bolt',
                constraints: [
                  ...mandatory('pistol-min'),
                  { id: 'pistol-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  { id: 'bolt', name: 'Bolt pistol', type: 'upgrade' as const },
                  { id: 'plasma', name: 'Plasma pistol', type: 'upgrade' as const },
                ],
              },
              {
                id: 'melee',
                name: 'Melee',
                defaultSelectionEntryId: 'sword',
                constraints: [
                  ...mandatory('melee-min'),
                  { id: 'melee-max', type: 'max' as const, value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  { id: 'sword', name: 'Chainsword', type: 'upgrade' as const, collective: true },
                  {
                    id: 'fist',
                    name: 'Power fist',
                    type: 'upgrade' as const,
                    constraints: [
                      {
                        id: 'fist-max',
                        type: 'max' as const,
                        value: 2,
                        field: 'selections',
                        scope: 'unit',
                        includeChildSelections: true,
                        shared: true,
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
  const pistols = { 'marine/pistol': { bolt: 3, plasma: 2 } }

  it('keeps the whole squad’s count of what the first choice did not touch', () => {
    const built = buildUnit('squad', index, 5, undefined, { spreads: pistols })!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Chainsword', count: 5 })
  })

  it('gives each part of the squad its own share of the second choice', () => {
    const built = buildUnit('squad', index, 5, undefined, { spreads: { ...pistols, 'marine/melee': { sword: 3, fist: 2 } } })!
    expect(wargearOf(built.selection, index).toSorted((left, right) => left.name.localeCompare(right.name))).toEqual([
      { name: 'Bolt pistol', count: 3 },
      { name: 'Chainsword', count: 3 },
      { name: 'Plasma pistol', count: 2 },
      { name: 'Power fist', count: 2 },
    ])
  })

  it('limits the second choice by the whole squad', () => {
    const built = buildUnit('squad', index, 5, undefined, { spreads: { ...pistols, 'marine/melee': { sword: 3, fist: 2 } } })!
    const melee = built.choices.find((choice) => choice.name === 'Melee')
    expect(melee?.options.find((option) => option.id === 'fist')?.max).toBe(2)
  })

  it('offers the second choice to every model', () => {
    const built = buildUnit('squad', index, 5, undefined, { spreads: pistols })!
    expect(built.choices.find((choice) => choice.name === 'Melee')?.room).toBe(5)
  })
})
