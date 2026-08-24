import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate } from './evaluate'
import { withChoice } from './expand'
import { buildUnit } from './roster'
import { unitChoices } from './unitChoices'
import { modelCountOf } from './unitSize'
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
      options: [{ id: 'shield', name: 'Shieldvanes', points: 0, count: 0, max: 3 }],
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
    expect(choice?.options).toEqual([{ id: 'charge', name: 'Demolition charge', points: 15, count: 0, max: 1 }])
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
