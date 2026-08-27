import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate } from './evaluate'
import { defaultSelection, withChoice } from './expand'
import { buildUnit } from './roster'
import { unitChoices } from './unitChoices'
import { withUnitSpread } from './unitSpread'
import { modelCountOf, sizeOf } from './unitSize'
import { wargearOf } from './wargear'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const mandatory = (id: string) => [{ id, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }]

const points = (value: number) => [{ name: 'pts', typeId: PTS, value }]

describe('fixed squad sizes', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'composition',
            name: 'Unit Composition',
            defaultSelectionEntryId: 'ten-models',
            constraints: [
              { id: 'composition-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'composition-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'ten-models',
                name: '10 models',
                type: 'upgrade',
                selectionEntries: [
                  {
                    id: 'ten-bodies',
                    name: 'Bodies',
                    type: 'model',
                    constraints: [{ id: 'ten-min', type: 'min', value: 10, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
              {
                id: 'twenty-models',
                name: '20 models',
                type: 'upgrade',
                selectionEntries: [
                  {
                    id: 'twenty-bodies',
                    name: 'Bodies',
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

  it('offers and preserves only the declared model counts', () => {
    expect(buildUnit('squad', index)?.size).toMatchObject({ models: 10, min: 10, max: 20, options: [10, 20] })
    expect(buildUnit('squad', index, 11)?.size.models).toBe(10)
    expect(buildUnit('squad', index, 19)?.size.models).toBe(20)
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

describe('a required model replaced by an optional specialist', () => {
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
              { id: 'models-max', type: 'max', value: 10, field: 'selections', scope: 'parent' },
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
                constraints: [
                  { id: 'trooper-min', type: 'min', value: 4, field: 'selections', scope: 'parent' },
                  { id: 'trooper-max', type: 'max', value: 9, field: 'selections', scope: 'parent' },
                ],
                modifierGroups: [
                  {
                    modifiers: [
                      { type: 'decrement', value: 1, field: 'trooper-min' },
                      { type: 'decrement', value: 1, field: 'trooper-max' },
                    ],
                    repeats: [{ value: 1, field: 'selections', scope: 'parent', childId: 'specialist' }],
                  },
                ],
              },
              {
                id: 'specialist',
                name: 'Specialist',
                type: 'model',
                constraints: [{ id: 'specialist-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                modifiers: [
                  {
                    type: 'add',
                    value: 'Max 1 specialist per 5 models',
                    field: 'error',
                    conditionGroups: [
                      {
                        type: 'and',
                        conditions: [
                          {
                            type: 'lessThan',
                            value: 10,
                            field: 'selections',
                            scope: 'squad',
                            childId: 'model',
                            includeChildSelections: true,
                          },
                          {
                            type: 'greaterThan',
                            value: 1,
                            field: 'selections',
                            scope: 'squad',
                            childId: 'specialist',
                            includeChildSelections: true,
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
      },
    ],
  })

  it('offers one specialist in a five-model squad', () => {
    const choice = buildUnit('squad', index, 5)?.choices.find((candidate) => candidate.name === 'Models')
    expect(choice?.options.find((option) => option.id === 'specialist')?.max).toBe(1)
  })

  it('keeps the required models available in a five-model squad', () => {
    const choice = buildUnit('squad', index, 5)?.choices.find((candidate) => candidate.name === 'Models')
    expect(choice?.options.find((option) => option.id === 'trooper')?.max).toBe(4)
  })

  it('offers two specialists in a ten-model squad', () => {
    const choice = buildUnit('squad', index, 10)?.choices.find((candidate) => candidate.name === 'Models')
    expect(choice?.options.find((option) => option.id === 'specialist')?.max).toBe(2)
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
                profiles: [{ id: 'veteran-profile', name: 'Trooper', typeName: 'Unit' }],
                constraints: [{ id: 'veteran-max', type: 'max', value: 9, field: 'selections', scope: 'parent' }],
                selectionEntries: [{ id: 'rifle', name: 'Rifle', type: 'upgrade', constraints: mandatory('rifle-min') }],
              },
              {
                id: 'sergeant',
                name: 'Sergeant',
                type: 'model',
                profiles: [{ id: 'sergeant-profile', name: 'Sergeant', typeName: 'Unit' }],
                constraints: [
                  ...mandatory('sergeant-min'),
                  { id: 'sergeant-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
              },
              {
                id: 'gunner',
                name: 'Gunner',
                type: 'model',
                profiles: [{ id: 'gunner-profile', name: 'Trooper', typeName: 'Unit' }],
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

  it('counts specialists split across two nested choices as one kind of model', () => {
    const built = buildUnit('squad', index, 10, undefined, {
      spreads: { [key]: { 'heavy-bolter': 1, pyrecannon: 1 } },
    })!
    const choice = built.choices.find((candidate) => candidate.key === 'models')
    expect(choice?.options.find((option) => option.id === 'gunner')?.count).toBe(2)
  })

  it('sends a disarmed specialist back to the squad it came from', () => {
    const built = buildUnit('squad', index, 10, undefined, {
      spreads: { models: { gunner: 1 }, [key]: { 'heavy-bolter': 0, pyrecannon: 0 } },
    })!
    expect(modelCountOf(built.selection, index)).toBe(10)
    expect(wargearOf(built.selection, index)).toEqual([{ name: 'Rifle', count: 9 }])
    expect(built.choices.find((choice) => choice.key === 'models')?.options.find((option) => option.id === 'gunner')?.count).toBe(0)
  })

  it('names the model a nested choice belongs to, and leaves the squad-wide choice without one', () => {
    const built = buildUnit('squad', index, 10)!
    expect(built.choices.find((choice) => choice.key === key)?.owner?.name).toBe('Gunner')
    expect(built.choices.find((choice) => choice.key === 'models')?.owner).toBeNull()
  })

  /**
   * Arming a model the squad did not have yet costs it a body. Both halves of that
   * were wrong: the squad grew past its size, and the model it grew past was the
   * sergeant the data insists on.
   */
  it('takes the body for a new specialist from a squadmate, not from the required model', () => {
    const armed = buildUnit('squad', index, 10, undefined, {
      spreads: { models: { veteran: 9 }, [key]: { 'heavy-bolter': 1 } },
    })!
    const models = armed.choices.find((choice) => choice.key === 'models')
    expect(models?.options.map((option) => `${option.id}=${option.count}`)).toEqual(['veteran=8', 'gunner=1'])
    expect(modelCountOf(armed.selection, index)).toBe(10)
    expect(wargearOf(armed.selection, index)).toContainEqual({ name: 'Heavy bolter', count: 1 })
  })

  /**
   * A squad and one of its models can both have an opinion about that model. The
   * squad's is the wider one and settles first, so what the model was handed is not
   * put down again — and the answer no longer depends on which of the two the saved
   * list happens to name first.
   */
  it('lets a model keep the weapon it was given when the squad also names that model', () => {
    const spreads = { [key]: { 'heavy-bolter': 1 }, models: { veteran: 9, gunner: 0 } }
    const armed = buildUnit('squad', index, 10, undefined, { spreads })!
    const reversed = buildUnit('squad', index, 10, undefined, {
      spreads: Object.fromEntries(Object.entries(spreads).toReversed()),
    })!
    for (const built of [armed, reversed]) {
      expect(built.choices.find((choice) => choice.key === key)?.options.find((option) => option.id === 'heavy-bolter')?.count).toBe(1)
      expect(modelCountOf(built.selection, index)).toBe(10)
    }
  })

  /**
   * A count the squad keeps for a model that arms itself is a leftover opinion, and
   * spending a body on it starves whatever the player actually asked for — silently,
   * because the group is full either way.
   */
  it('ignores a squad-level count for a model whose own wargear decides how many there are', () => {
    const built = buildUnit('squad', index, 10, undefined, {
      spreads: { models: { veteran: 8, gunner: 1, sergeant: 1 }, [key]: { 'heavy-bolter': 0, pyrecannon: 0 } },
    })!
    const models = built.choices.find((choice) => choice.key === 'models')
    // No heavy weapon taken, so no gunner — and the body it was holding goes back
    // to the squad rather than being spent on a model carrying nothing.
    expect(models?.options.find((option) => option.id === 'gunner')?.count).toBe(0)
    expect(modelCountOf(built.selection, index)).toBe(10)
    expect(wargearOf(built.selection, index)).not.toContainEqual(expect.objectContaining({ name: 'Heavy bolter' }))
  })

  /**
   * The kinds of model a datasheet names, against the per-loadout entries the
   * catalogue splits each kind into: a gunner is a trooper holding a heavy weapon,
   * not a third kind of model standing beside the sergeant.
   */
  it('groups per-loadout model entries by the kind of model they are', () => {
    const built = buildUnit('squad', index, 10)!
    expect(built.choices.find((choice) => choice.key === key)?.owner?.profile).toBe('Trooper')
    expect(built.choices.find((choice) => choice.key === 'models')?.options.map((option) => option.profile)).toEqual(['Trooper', 'Trooper'])
  })

  it('keeps a new specialist model complete when its nested weapon adds it to the squad', () => {
    const specialistIndex = indexOf({
      sharedSelectionEntries: [
        {
          id: 'terminators',
          name: 'Terminators',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'members',
              name: 'Members',
              defaultSelectionEntryId: 'terminator',
              constraints: [
                { id: 'members-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                { id: 'members-max', type: 'max', value: 2, field: 'selections', scope: 'parent' },
              ],
              selectionEntries: [
                {
                  id: 'terminator',
                  name: 'Terminator',
                  type: 'model',
                  selectionEntries: [{ id: 'bolter', name: 'Storm bolter', type: 'upgrade', constraints: mandatory('bolter-min') }],
                },
                {
                  id: 'heavy-terminator',
                  name: 'Terminator with heavy weapon',
                  type: 'model',
                  selectionEntries: [{ id: 'fist', name: 'Power fist', type: 'upgrade', constraints: mandatory('fist-min') }],
                  selectionEntryGroups: [
                    {
                      id: 'heavy-weapon',
                      name: 'Heavy weapon',
                      constraints: [
                        { id: 'heavy-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                        { id: 'heavy-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                      ],
                      selectionEntries: [{ id: 'launcher', name: 'Missile launcher', type: 'upgrade' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const built = buildUnit('terminators', specialistIndex, 2, undefined, {
      spreads: { 'members/heavy-terminator/heavy-weapon': { launcher: 1 } },
    })!
    const chosen = buildUnit('terminators', specialistIndex, undefined, {
      'members/heavy-terminator/heavy-weapon': 'launcher',
    })!
    const spread = withUnitSpread(
      defaultSelection('terminators', specialistIndex)!,
      'members/heavy-terminator/heavy-weapon',
      { launcher: 1 },
      specialistIndex,
    )

    expect({ models: modelCountOf(built.selection, specialistIndex), wargear: wargearOf(built.selection, specialistIndex) }).toEqual({
      models: 2,
      wargear: [
        { name: 'Storm bolter', count: 1 },
        { name: 'Power fist', count: 1 },
        { name: 'Missile launcher', count: 1 },
      ],
    })
    expect(modelCountOf(spread, specialistIndex)).toBe(2)
    expect({ models: modelCountOf(chosen.selection, specialistIndex), wargear: wargearOf(chosen.selection, specialistIndex) }).toEqual({
      models: 2,
      wargear: [
        { name: 'Storm bolter', count: 1 },
        { name: 'Power fist', count: 1 },
        { name: 'Missile launcher', count: 1 },
      ],
    })
  })
})

describe('choices nested inside a selected loadout', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'captain',
        name: 'Captain',
        type: 'model',
        selectionEntryGroups: [
          {
            id: 'wargear',
            name: 'Wargear',
            defaultSelectionEntryId: 'standard-loadout',
            constraints: [
              { id: 'wargear-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'wargear-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'standard-loadout',
                name: 'Bolt pistol, master-crafted bolter, melee weapon',
                type: 'upgrade',
                selectionEntryGroups: [
                  {
                    id: 'melee-weapon',
                    name: 'Melee weapon',
                    defaultSelectionEntryId: 'close-combat-weapon',
                    constraints: [
                      { id: 'melee-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'melee-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                    selectionEntries: [
                      { id: 'close-combat-weapon', name: 'Close combat weapon', type: 'upgrade' },
                      { id: 'power-fist', name: 'Power fist', type: 'upgrade' },
                    ],
                  },
                ],
              },
              { id: 'shield-loadout', name: 'Relic shield', type: 'upgrade' },
            ],
          },
        ],
      },
    ],
  })

  it('offers the choices inside the selected loadout only', () => {
    expect(buildUnit('captain', index)?.choices.map(({ key, options }) => [key, options.map(({ name }) => name)])).toEqual([
      ['wargear', ['Bolt pistol, master-crafted bolter, melee weapon', 'Relic shield']],
      ['wargear/standard-loadout/melee-weapon', ['Close combat weapon', 'Power fist']],
    ])
  })

  it.each([
    ['parent first', { wargear: 'standard-loadout', 'wargear/standard-loadout/melee-weapon': 'power-fist' }],
    ['child first', { 'wargear/standard-loadout/melee-weapon': 'power-fist', wargear: 'standard-loadout' }],
  ])('applies nested choices with the %s', (_, choices) => {
    expect(wargearOf(buildUnit('captain', index, undefined, choices)!.selection, index)).toEqual([{ name: 'Power fist', count: 1 }])
  })

  it('ignores a nested choice when its parent loadout is not selected', () => {
    const built = buildUnit('captain', index, undefined, {
      wargear: 'shield-loadout',
      'wargear/standard-loadout/melee-weapon': 'power-fist',
    })!

    expect({ wargear: wargearOf(built.selection, index), errors: evaluate([built.selection], index).errors }).toEqual({
      wargear: [{ name: 'Relic shield', count: 1 }],
      errors: [],
    })
  })

  it('fills a required nested choice that becomes visible with its model', () => {
    const visibleWithModel = {
      type: 'set' as const,
      field: 'hidden',
      value: true,
      conditions: [
        {
          type: 'lessThan' as const,
          value: 1,
          field: 'selections',
          scope: 'roster',
          childId: 'veteran',
          includeChildSelections: true,
        },
      ],
    }
    const conditional = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Unit composition',
              defaultSelectionEntryId: 'five-models',
              constraints: mandatory('composition-min'),
              selectionEntries: [
                {
                  id: 'five-models',
                  name: 'Five models',
                  type: 'upgrade',
                  selectionEntries: [
                    {
                      id: 'veteran',
                      name: 'Veteran',
                      type: 'model',
                      constraints: mandatory('veteran-min'),
                      selectionEntryGroups: [
                        {
                          id: 'weapon',
                          name: 'Weapon',
                          defaultSelectionEntryId: 'hammer',
                          constraints: [
                            { id: 'weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                            { id: 'weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                          ],
                          selectionEntries: [
                            { id: 'hammer', name: 'Heavy thunder hammer', type: 'upgrade', modifiers: [visibleWithModel] },
                            { id: 'shield', name: 'Shield', type: 'upgrade', modifiers: [visibleWithModel] },
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

    expect(wargearOf(buildUnit('squad', conditional)!.selection, conditional)).toEqual([{ name: 'Heavy thunder hammer', count: 1 }])
  })
})

describe('optional wargear on repeated models', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'unit',
        name: 'Unit',
        type: 'unit',
        selectionEntries: [
          {
            id: 'model',
            name: 'Model',
            type: 'model',
            constraints: [
              { id: 'model-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
              { id: 'model-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'shield',
                name: 'Shieldvanes',
                type: 'upgrade',
                constraints: [{ id: 'shield-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
            selectionEntryGroups: [
              {
                id: 'wargear',
                name: 'Wargear',
                constraints: [{ id: 'wargear-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                selectionEntries: [
                  { id: 'loom', name: 'Shadowloom', type: 'upgrade' },
                  { id: 'scope', name: 'Nebuloscope', type: 'upgrade' },
                ],
              },
              {
                id: 'weapon',
                name: 'Weapon',
                defaultSelectionEntryId: 'blaster',
                constraints: [
                  { id: 'weapon-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                  { id: 'weapon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
                selectionEntries: [
                  { id: 'blaster', name: 'Blaster', type: 'upgrade' },
                  { id: 'beamer', name: 'Beamer', type: 'upgrade' },
                  { id: 'carbine', name: 'Carbine', type: 'upgrade' },
                ],
              },
            ],
          },
        ],
      },
    ],
  })

  it('offers one optional upgrade for each model', () => {
    expect(buildUnit('unit', index)?.choices).toContainEqual({
      key: 'model/shield',
      name: 'Shieldvanes',
      chosen: '',
      optional: true,
      carried: true,
      room: 3,
      uniform: false,
      options: [{ id: 'shield', name: 'Shieldvanes', points: 0, count: 0, min: 0, max: 3 }],
      owner: null,
    })
  })

  it('equips the upgrade on only the requested models', () => {
    const built = buildUnit('unit', index, 3, undefined, { spreads: { 'model/shield': { shield: 2 } } })!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Shieldvanes', count: 2 })
    expect(built.choices.find((choice) => choice.key === 'model/shield')?.options[0]?.count).toBe(2)
    expect(built.size.models).toBe(3)
  })

  it('keeps unequipped models when a repeated optional group changes', () => {
    const equipped = buildUnit('unit', index, 3, undefined, { spreads: { 'model/wargear': { loom: 1, scope: 0 } } })!
    expect(modelCountOf(equipped.selection, index)).toBe(3)

    const removed = buildUnit('unit', index, 3, undefined, { spreads: { 'model/wargear': { loom: 0, scope: 0 } } })!
    expect(modelCountOf(removed.selection, index)).toBe(3)
  })

  it('keeps the unit resizable after splitting an optional group', () => {
    const six = buildUnit('unit', index, 6, undefined, { spreads: { 'model/wargear': { loom: 2, scope: 0 } } })!
    expect(six.size).toMatchObject({ min: 3, max: 6, models: 6 })

    const five = buildUnit('unit', index, 5, undefined, { spreads: { 'model/wargear': { loom: 2, scope: 0 } } })!
    expect(five.size).toMatchObject({ min: 3, max: 6, models: 5 })
  })

  it('lets each model carry a different weapon', () => {
    const built = buildUnit('unit', index, 3, undefined, {
      spreads: {
        'model/weapon': { blaster: 1, beamer: 1, carbine: 1 },
        'model/shield': { shield: 2 },
      },
    })!
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Blaster', count: 1 },
      { name: 'Shieldvanes', count: 2 },
      { name: 'Beamer', count: 1 },
      { name: 'Carbine', count: 1 },
    ])
  })

  it('keeps one repeated choice while applying another', () => {
    const built = buildUnit('unit', index, 3, undefined, {
      spreads: {
        'model/weapon': { blaster: 0, beamer: 3, carbine: 0 },
        'model/wargear': { loom: 3, scope: 0 },
      },
    })!

    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Beamer', count: 3 },
      { name: 'Shadowloom', count: 3 },
    ])
  })
})

describe('independent wargear on repeated models', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'unit',
        name: 'Unit',
        type: 'unit',
        selectionEntries: [
          {
            id: 'model',
            name: 'Model',
            type: 'model',
            constraints: [
              { id: 'model-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'model-max', type: 'max', value: 2, field: 'selections', scope: 'parent' },
            ],
            selectionEntryGroups: [
              {
                id: 'systems',
                name: 'Systems',
                selectionEntries: [
                  {
                    id: 'claws',
                    name: 'Automaton claws',
                    type: 'upgrade',
                    constraints: [
                      { id: 'claws-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                      { id: 'claws-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                    ],
                  },
                  {
                    id: 'array',
                    name: 'Fabricator claw array',
                    type: 'upgrade',
                    constraints: [{ id: 'array-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                  },
                  {
                    id: 'beamers',
                    name: 'Two particle beamers',
                    type: 'upgrade',
                    constraints: [{ id: 'beamers-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                    selectionEntries: [
                      {
                        id: 'beamer',
                        name: 'Particle beamer',
                        type: 'upgrade',
                        constraints: [
                          { id: 'beamer-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                          { id: 'beamer-max', type: 'max', value: 2, field: 'selections', scope: 'parent' },
                        ],
                      },
                    ],
                  },
                  {
                    id: 'prism',
                    name: 'Gloom prism',
                    type: 'upgrade',
                    constraints: [{ id: 'prism-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  const key = 'model/systems'

  it('keeps mandatory wargear when one optional system is equipped', () => {
    const built = buildUnit('unit', index, 1, undefined, { spreads: { [key]: { array: 1 } } })!
    expect({ models: built.size.models, wargear: wargearOf(built.selection, index) }).toEqual({
      models: 1,
      wargear: [
        { name: 'Automaton claws', count: 1 },
        { name: 'Fabricator claw array', count: 1 },
      ],
    })
  })

  it('equips independent systems on the same model', () => {
    const built = buildUnit('unit', index, 1, undefined, { spreads: { [key]: { array: 1, beamers: 1 } } })!
    expect({ size: built.size, wargear: wargearOf(built.selection, index) }).toEqual({
      size: { min: 1, max: 2, models: 1, path: ['model'] },
      wargear: [
        { name: 'Automaton claws', count: 1 },
        { name: 'Fabricator claw array', count: 1 },
        { name: 'Particle beamer', count: 2 },
      ],
    })
  })

  it('removes one independent system without disturbing the others', () => {
    const armed = buildUnit('unit', index, 1, undefined, { spreads: { [key]: { array: 1, beamers: 1 } } })!
    const removed = withUnitSpread(armed.selection, key, { array: 1, beamers: 0, prism: 0 }, index)
    expect({ models: modelCountOf(removed, index), wargear: wargearOf(removed, index) }).toEqual({
      models: 1,
      wargear: [
        { name: 'Automaton claws', count: 1 },
        { name: 'Fabricator claw array', count: 1 },
      ],
    })
  })

  it('recombines identical models after removing their independent systems', () => {
    const armed = buildUnit('unit', index, 2, undefined, { spreads: { [key]: { array: 1, beamers: 2 } } })!
    const removed = withUnitSpread(armed.selection, key, { array: 0, beamers: 0, prism: 0 }, index)
    expect(sizeOf(removed, index)).toEqual({ min: 1, max: 2, models: 2, path: ['model'] })
  })

  it('keeps two fully equipped models within the declared unit size', () => {
    const built = buildUnit('unit', index, 2, undefined, { spreads: { [key]: { array: 2, beamers: 2, prism: 2 } } })!
    expect({ size: built.size, wargear: wargearOf(built.selection, index), errors: evaluate([built.selection], index).errors }).toEqual({
      size: { min: 1, max: 2, models: 2, path: ['model'] },
      wargear: [
        { name: 'Automaton claws', count: 2 },
        { name: 'Fabricator claw array', count: 2 },
        { name: 'Particle beamer', count: 4 },
        { name: 'Gloom prism', count: 2 },
      ],
      errors: [],
    })
  })
})

describe('optional unit composition defaults', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'unit',
        name: 'Unit',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'composition',
            name: 'Unit Composition',
            selectionEntryGroups: [
              {
                id: 'models',
                name: 'Models',
                selectionEntries: [
                  {
                    id: 'model',
                    name: 'Model',
                    type: 'model',
                    constraints: [
                      { id: 'model-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
                      { id: 'model-max', type: 'max', value: 6, field: 'selections', scope: 'parent' },
                    ],
                  },
                ],
              },
            ],
            selectionEntries: [
              {
                id: 'token',
                name: 'Token',
                type: 'upgrade',
                constraints: [{ id: 'token-max', type: 'max', value: 2, field: 'selections', scope: 'parent' }],
                modifiers: [
                  {
                    type: 'decrement',
                    value: 1,
                    field: 'token-max',
                    conditions: [
                      {
                        type: 'lessThan',
                        value: 6,
                        field: 'selections',
                        scope: 'unit',
                        childId: 'model',
                        includeChildSelections: true,
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

  it('includes the available ancillary and keeps it editable', () => {
    const built = buildUnit('unit', index)!
    expect(wargearOf(built.selection, index)).toContainEqual({ name: 'Token', count: 1 })
    expect(built.choices.find((choice) => choice.name === 'Unit Composition')?.options[0]?.count).toBe(1)
  })

  it('follows the ancillary allowance when the unit grows', () => {
    expect(wargearOf(buildUnit('unit', index, 6)!.selection, index)).toContainEqual({ name: 'Token', count: 2 })
  })

  it('preserves an explicit decline when the unit grows', () => {
    const built = buildUnit('unit', index, 6, undefined, { spreads: { composition: { token: 0 } } })!
    expect(wargearOf(built.selection, index)).not.toContainEqual({ name: 'Token', count: 2 })
    expect(built.choices.find((choice) => choice.name === 'Unit Composition')?.options[0]?.count).toBe(0)
  })
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

  it('offers the sole eligible option in an optional group', () => {
    const index = indexOf(catalogue())
    const built = buildUnit('grunt', index)!
    expect(built.choices.map((choice) => ({ name: choice.name, options: choice.options.map((option) => option.name) }))).toEqual([
      { name: 'Enhancements', options: ['Banner'] },
    ])
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

describe('a choice the data closes behind another', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'champion',
        name: 'Champion',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'ranged',
            name: 'Ranged Option',
            defaultSelectionEntryId: 'rifle',
            constraints: [
              { id: 'ranged-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'ranged-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              { id: 'rifle', name: 'Rifle', type: 'upgrade' },
              { id: 'combi', name: 'Combi-weapon', type: 'upgrade' },
            ],
          },
          {
            id: 'melee',
            name: 'Melee Option',
            constraints: [{ id: 'melee-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
            // A combi-weapon takes both hands, and the data says so by closing the
            // melee group rather than by naming what it rules out.
            modifiers: [
              {
                type: 'set',
                value: 0,
                field: 'melee-max',
                conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'champion', childId: 'combi' }],
              },
            ],
            selectionEntries: [
              { id: 'power-weapon', name: 'Power weapon', type: 'upgrade' },
              { id: 'chainsword', name: 'Chainsword', type: 'upgrade' },
            ],
          },
        ],
      },
    ],
  })

  it('holds both while the data allows both', () => {
    const built = buildUnit('champion', index, undefined, { ranged: 'rifle', melee: 'power-weapon' })!
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Rifle', count: 1 },
      { name: 'Power weapon', count: 1 },
    ])
    expect(evaluate([built.selection], index).errors).toEqual([])
  })

  it('lets go of the closed choice rather than reporting it back', () => {
    const built = buildUnit('champion', index, undefined, { ranged: 'combi', melee: 'power-weapon' })!
    expect(wargearOf(built.selection, index)).toEqual([{ name: 'Combi-weapon', count: 1 }])
    expect(evaluate([built.selection], index).errors).toEqual([])
  })
})

describe('a wargear group holding both the fixed guns and the optional extras', () => {
  // How every tank in the game is written: the group carries no cap of its own, the
  // guns it always has sit in it with minimums, and the pintle mounts sit beside them
  // with a maximum of one each. Nothing competes, so a Land Raider may bolt on all of
  // them — reading the group as one shared slot offered none of them at all.
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'tank',
        name: 'Land Raider',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'wargear',
            name: 'Wargear',
            selectionEntries: [
              {
                id: 'tracks',
                name: 'Armoured tracks',
                type: 'upgrade',
                constraints: [
                  { id: 'tracks-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                  { id: 'tracks-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                ],
              },
              {
                id: 'hunter-killer',
                name: 'Hunter-killer missile',
                type: 'upgrade',
                constraints: [{ id: 'hk-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
              {
                id: 'multi-melta',
                name: 'Multi-melta',
                type: 'upgrade',
                constraints: [{ id: 'mm-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
              {
                id: 'storm-bolter',
                name: 'Storm bolter',
                type: 'upgrade',
                constraints: [{ id: 'sb-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
    ],
  })

  it('offers every extra, each to its own maximum', () => {
    const [choice, ...rest] = buildUnit('tank', index)!.choices
    expect(rest).toEqual([])
    expect(choice?.room).toBe(3)
    expect(choice?.options.map((option) => [option.name, option.max])).toEqual([
      ['Hunter-killer missile', 1],
      ['Multi-melta', 1],
      ['Storm bolter', 1],
    ])
  })

  it('lets the tank carry all of them at once', () => {
    const built = buildUnit('tank', index, undefined, undefined, {
      spreads: { wargear: { 'hunter-killer': 1, 'multi-melta': 1, 'storm-bolter': 1 } },
    })!
    expect(wargearOf(built.selection, index)).toEqual([
      { name: 'Armoured tracks', count: 1 },
      { name: 'Hunter-killer missile', count: 1 },
      { name: 'Multi-melta', count: 1 },
      { name: 'Storm bolter', count: 1 },
    ])
    expect(evaluate([built.selection], index).errors).toEqual([])
  })

  it('ignores a saved choice once its option becomes required', () => {
    const built = buildUnit('tank', index, undefined, { wargear: 'tracks' })!

    expect({ wargear: wargearOf(built.selection, index), errors: evaluate([built.selection], index).errors }).toEqual({
      wargear: [{ name: 'Armoured tracks', count: 1 }],
      errors: [],
    })
  })

  it('offers one optional extra without replacing the required equipment', () => {
    const oneExtra = indexOf({
      sharedSelectionEntries: [
        {
          id: 'transport',
          name: 'Impulsor',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'wargear',
              name: 'Wargear',
              selectionEntries: [
                {
                  id: 'hull',
                  name: 'Armoured hull',
                  type: 'upgrade',
                  constraints: [
                    { id: 'hull-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                    { id: 'hull-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
                  ],
                },
                {
                  id: 'stubber',
                  name: 'Ironhail heavy stubber',
                  type: 'upgrade',
                  constraints: [{ id: 'stubber-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(buildUnit('transport', oneExtra)?.choices).toContainEqual(
      expect.objectContaining({
        key: 'wargear',
        optional: true,
        options: [expect.objectContaining({ id: 'stubber', name: 'Ironhail heavy stubber', max: 1 })],
      }),
    )
    expect(wargearOf(buildUnit('transport', oneExtra, undefined, { wargear: 'stubber' })!.selection, oneExtra)).toEqual([
      { name: 'Armoured hull', count: 1 },
      { name: 'Ironhail heavy stubber', count: 1 },
    ])
  })
})

describe('a replacement group whose default is relaxed by a modifier', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'champion',
        name: 'Champion',
        type: 'model',
        selectionEntryGroups: [
          {
            id: 'weapons',
            name: 'Weapons',
            constraints: [
              { id: 'weapons-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
              { id: 'weapons-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
            ],
            defaultSelectionEntryId: 'knife-link',
            entryLinks: [
              {
                id: 'knife-link',
                name: 'Plague knives',
                type: 'selectionEntry',
                targetId: 'knives',
                modifiers: [{ type: 'set', field: 'knives-min', value: 0 }],
              },
            ],
            selectionEntries: [
              {
                id: 'fist',
                name: 'Power fist',
                type: 'upgrade',
                constraints: [{ id: 'fist-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
              },
            ],
          },
        ],
      },
      {
        id: 'knives',
        name: 'Plague knives',
        type: 'upgrade',
        constraints: [
          { id: 'knives-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
          { id: 'knives-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
        ],
      },
    ],
  })

  it('offers the default and its replacement', () => {
    expect(buildUnit('champion', index)?.choices[0]).toMatchObject({
      key: 'weapons',
      chosen: 'knife-link',
      options: [
        { id: 'fist', name: 'Power fist' },
        { id: 'knife-link', name: 'Plague knives' },
      ],
    })
  })

  it('replaces the default without leaving both weapons selected', () => {
    const built = buildUnit('champion', index, undefined, { weapons: 'fist' })!

    expect({ wargear: wargearOf(built.selection, index), errors: evaluate([built.selection], index).errors }).toEqual({
      wargear: [{ name: 'Power fist', count: 1 }],
      errors: [],
    })
  })
})

describe('who the data lets a list nominate as its Warlord', () => {
  // A tank carries the entry only underneath an upgrade a detachment unlocks, and the
  // data hides it until then. Walking past that offered a crown to every vehicle.
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'captain',
        name: 'Captain',
        type: 'model',
        entryLinks: [{ id: 'captain-warlord', targetId: 'warlord', type: 'selectionEntry' }],
      },
      {
        id: 'tank',
        name: 'Land Raider',
        type: 'unit',
        entryLinks: [{ id: 'tank-ace', targetId: 'ace', type: 'selectionEntry' }],
      },
      {
        id: 'ace',
        name: 'Tank Ace Character',
        type: 'upgrade',
        constraints: [{ id: 'ace-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
        modifiers: [
          {
            type: 'set',
            value: true,
            field: 'hidden',
            conditions: [{ type: 'lessThan', value: 1, field: 'selections', scope: 'roster', childId: 'headhunters' }],
          },
        ],
        // The crown is inside the upgrade and guarded by it, so buying the upgrade is
        // what puts it within reach.
        entryLinks: [
          {
            id: 'ace-warlord',
            targetId: 'warlord',
            type: 'selectionEntry',
            modifiers: [
              {
                type: 'set',
                value: true,
                field: 'hidden',
                conditions: [
                  { type: 'notInstanceOf', value: 1, field: 'selections', scope: 'ancestor', childId: 'ace', includeChildSelections: true },
                ],
              },
            ],
          },
        ],
      },
      { id: 'warlord', name: 'Warlord', type: 'upgrade' },
      { id: 'headhunters', name: 'Headhunter Task Force', type: 'upgrade' },
    ],
  })

  it('offers the crown to a character', () => {
    expect(buildUnit('captain', index)!.toggles.map((toggle) => toggle.name)).toEqual(['Warlord'])
  })

  it('keeps it from a tank whose detachment does not make it a character', () => {
    expect(buildUnit('tank', index)!.toggles).toEqual([])
  })

  it('hands the crown over once the detachment is taken and the upgrade with it', () => {
    const roster = [{ id: 'headhunters', count: 1 }]
    const offered = buildUnit('tank', index, undefined, undefined, { roster })!
    expect(offered.choices.map((choice) => choice.name)).toEqual(['Tank Ace Character'])
    expect(offered.toggles).toEqual([])

    const ace = offered.choices[0]
    const crowned = buildUnit('tank', index, undefined, { [ace?.key ?? '']: ace?.options[0]?.id ?? '' }, { roster })!
    expect(crowned.toggles.map((toggle) => toggle.name)).toEqual(['Warlord'])
  })

  it('leaves the crown out of the wargear, since it is not a thing the unit carries', () => {
    expect(buildUnit('captain', index)!.choices).toEqual([])
  })
})

describe('a squad the data will not let hold two things at once', () => {
  // The catalogue writes "all models must be equipped identically" as an error that
  // fires when the unit holds one of each, since there is no number in it to constrain.
  const forbidsMixing = [
    {
      type: 'add' as const,
      field: 'error',
      value: 'All models must be equipped identically',
      conditionGroups: [
        {
          type: 'and' as const,
          conditions: [
            { type: 'atLeast' as const, value: 1, field: 'selections', scope: 'squad', childId: 'blaster', includeChildSelections: true },
            { type: 'atLeast' as const, value: 1, field: 'selections', scope: 'squad', childId: 'carbine', includeChildSelections: true },
          ],
        },
      ],
    },
  ]

  const squad = (modifiers?: typeof forbidsMixing) =>
    indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Immortals',
          type: 'unit',
          modifiers,
          selectionEntries: [
            {
              id: 'body',
              name: 'Immortal',
              type: 'model',
              costs: points(14),
              constraints: [{ id: 'body-min', type: 'min', value: 5, field: 'selections', scope: 'parent' }],
              selectionEntryGroups: [
                {
                  id: 'guns',
                  name: 'Weapons',
                  defaultSelectionEntryId: 'blaster',
                  constraints: [{ id: 'guns-max', type: 'max', value: 5, field: 'selections', scope: 'parent' }],
                  selectionEntries: [
                    { id: 'blaster', name: 'Gauss blaster', type: 'upgrade' },
                    { id: 'carbine', name: 'Tesla carbine', type: 'upgrade' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

  it('asks the group once for the whole squad rather than counting it out', () => {
    const guns = buildUnit('squad', squad(forbidsMixing))!.choices.find((choice) => choice.name === 'Weapons')
    expect(guns?.uniform).toBe(true)
    expect(guns?.room).toBe(5)
  })

  /** What the squad ends up holding, which is the whole question here. */
  const carrying = (index: ReturnType<typeof squad>, spread: Record<string, number>) =>
    wargearOf(buildUnit('squad', index, 5, undefined, { spreads: { 'body/guns': spread } })!.selection, index).map((piece) => piece.name)

  it('takes the whole squad to the weapon it was asked for', () => {
    expect(carrying(squad(forbidsMixing), { carbine: 5, blaster: 0 })).toEqual(['Tesla carbine'])
  })

  it('leaves a list that states both exactly as it states it, and lets it be told', () => {
    // A roster pasted in from another builder is the player's, illegal or not. Quietly
    // issuing three of them a different gun is a worse answer than saying so.
    const index = squad(forbidsMixing)
    const built = buildUnit('squad', index, 5, undefined, { spreads: { 'body/guns': { blaster: 3, carbine: 2 } } })!
    expect(wargearOf(built.selection, index).map((piece) => piece.name)).toEqual(['Gauss blaster', 'Tesla carbine'])
    expect(evaluate([built.selection], index).errors.map((error) => error.message)).toEqual(['All models must be equipped identically'])
  })

  it('leaves a group the data says nothing about free to divide itself', () => {
    const index = squad()
    expect(buildUnit('squad', index)!.choices.find((choice) => choice.name === 'Weapons')?.uniform).toBe(false)
    expect(carrying(index, { blaster: 3, carbine: 2 })).toEqual(['Gauss blaster', 'Tesla carbine'])
  })
})

describe('an upgrade the data hangs on the unit rather than in a group', () => {
  // A lone yes-or-no needs no group to hold it, so it is written without one: a Chaos
  // unit's icon, an Infiltrator Squad's comms array, a demolition charge. Everything
  // that reads choices looked for a group, so none of them could ever be taken.
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Breachers',
        type: 'unit',
        selectionEntries: [
          { id: 'body', name: 'Breacher', type: 'model', constraints: mandatory('body-min'), costs: points(20) },
          {
            id: 'charge',
            name: 'Demolition charge',
            type: 'upgrade',
            costs: points(15),
            constraints: [{ id: 'charge-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
          },
        ],
      },
    ],
  })

  it('offers it as a choice the list may simply decline', () => {
    const [choice, ...rest] = buildUnit('squad', index)!.choices
    expect(rest).toEqual([])
    expect(choice).toMatchObject({ key: 'charge', name: 'Demolition charge', optional: true, room: 1, chosen: '', carried: false })
    expect(choice?.options).toEqual([{ id: 'charge', name: 'Demolition charge', points: 15, count: 0, min: 0, max: 1 }])
  })

  it('charges for it once when it is taken, and stops when it is put down', () => {
    const bare = buildUnit('squad', index)!
    expect(evaluate([bare.selection], index).points).toBe(20)

    const armed = buildUnit('squad', index, undefined, { charge: 'charge' })!
    expect(evaluate([armed.selection], index).points).toBe(35)
    expect(wargearOf(armed.selection, index)).toEqual([{ name: 'Demolition charge', count: 1 }])
    expect(armed.choices[0]?.chosen).toBe('charge')

    const disarmed = buildUnit('squad', index, undefined, { charge: '' })!
    expect(evaluate([disarmed.selection], index).points).toBe(20)
    expect(disarmed.choices[0]?.chosen).toBe('')
  })
})
