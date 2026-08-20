import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate, type Selection } from './evaluate'
import {
  buildUnit,
  defaultSelection,
  modelCountOf,
  modelKindsOf,
  unitChoices,
  unitSize,
  wargearOf,
  withChoice,
  withCounts,
  withSpread,
} from './roster'

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

  it('includes a hidden upgrade made mandatory by the selected detachment', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        { id: 'pantheon', name: 'Pantheon of Woe', type: 'upgrade' },
        {
          id: 'ctan',
          name: "C'tan Shard",
          type: 'model',
          costs: [{ name: 'pts', typeId: PTS, value: 330 }],
          selectionEntries: [
            {
              id: 'binding',
              name: 'Singularity Matrix',
              type: 'upgrade',
              hidden: true,
              costs: [{ name: 'pts', typeId: PTS, value: 45 }],
              constraints: [
                { id: 'binding-min', type: 'min', value: 0, field: 'selections', scope: 'parent' },
                { id: 'binding-max', type: 'max', value: 0, field: 'selections', scope: 'parent' },
              ],
              modifierGroups: [
                {
                  conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'pantheon' }],
                  modifiers: [
                    { type: 'set', field: 'hidden', value: false },
                    { type: 'set', field: 'binding-min', value: 1 },
                    { type: 'set', field: 'binding-max', value: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })

    const built = buildUnit('ctan', index, undefined, undefined, { roster: [{ id: 'pantheon' }] })!

    expect({ wargear: wargearOf(built.selection, index), points: evaluate([built.selection], index).points }).toEqual({
      wargear: [{ name: 'Singularity Matrix', count: 1 }],
      points: 375,
    })
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
describe('loadouts the catalogue files a weapon at a time', () => {
  const loadout = (id: string, name: string, weapons: readonly string[], profile?: string) => ({
    id,
    name,
    type: 'model' as const,
    ...(profile ? { profiles: [{ id: `${id}-profile`, name: profile, typeName: 'Unit' }] } : {}),
    selectionEntries: weapons.map((weapon, position) => ({
      id: `${id}-${position}`,
      name: weapon,
      type: 'upgrade' as const,
      constraints: mandatory(`${id}-${position}-min`),
    })),
  })

  const squadOf = (groups: { id: string; name: string; models: ReturnType<typeof loadout>[] }[]) =>
    indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Warriors',
          type: 'unit',
          selectionEntryGroups: groups.map((group) => ({
            id: group.id,
            name: group.name,
            defaultSelectionEntryId: group.models[0]?.id,
            constraints: [
              { id: `${group.id}-min`, type: 'min' as const, value: 2, field: 'selections', scope: 'parent' },
              { id: `${group.id}-max`, type: 'max' as const, value: 2, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: group.models,
          })),
        },
      ],
    })

  const kindsOf = (index: ReturnType<typeof indexOf>) => modelKindsOf('squad', buildUnit('squad', index)!.selection, index)

  it('gathers loadouts that differ by one weapon into the model they are all of', () => {
    const index = squadOf([
      {
        id: 'models',
        name: '10-20 Warriors',
        models: [
          loadout('flayer', 'Warrior w/ gauss flayer', ['Gauss flayer', 'Close combat weapon']),
          loadout('reaper', 'Warrior w/ gauss reaper', ['Gauss reaper', 'Close combat weapon']),
        ],
      },
    ])
    const kinds = kindsOf(index)

    expect(kinds).toHaveLength(1)
    expect(kinds[0]?.name).toBe('Warrior')
    expect(kinds[0]?.fixed).toEqual([{ name: 'Close combat weapon' }])
    expect(kinds[0]?.rows.map((row) => [row.name, row.optionId])).toEqual([
      ['Gauss flayer', 'flayer'],
      ['Gauss reaper', 'reaper'],
    ])
  })

  /** The same model, wherever the catalogue chose to file each of its weapons. */
  it('gathers loadouts of one model across the groups they are split between', () => {
    const index = squadOf([
      {
        id: 'models',
        name: '10-20 Warriors',
        models: [
          loadout('flayer', 'Warrior w/ gauss flayer', ['Gauss flayer', 'Close combat weapon']),
          loadout('reaper', 'Warrior w/ gauss reaper', ['Gauss reaper', 'Close combat weapon']),
        ],
      },
      {
        id: 'heavies',
        name: 'Heavy weapons',
        models: [
          loadout('cannon', 'Warrior w/ heavy cannon', ['Heavy cannon', 'Close combat weapon']),
          loadout('beamer', 'Warrior w/ plasma beamer', ['Plasma beamer', 'Close combat weapon']),
        ],
      },
    ])
    const kinds = kindsOf(index)

    expect(kinds).toHaveLength(1)
    expect(kinds[0]?.rows.map((row) => row.name)).toEqual(['Gauss flayer', 'Gauss reaper', 'Heavy cannon', 'Plasma beamer'])
  })

  /**
   * A pairing is not a weapon. A row per weapon would offer a gauntlet and a firepike
   * as two answers the player can mix, when the catalogue sells them as one model.
   */
  it('leaves loadouts that pair two weapons as the catalogue wrote them', () => {
    const index = squadOf([
      {
        id: 'models',
        name: 'Custodians',
        models: [
          loadout('spear', 'Custodian w/ gauntlet and bolter', ['Solerite gauntlet', 'Lastrum bolter']),
          loadout('axe', 'Custodian w/ talon and firepike', ['Solerite talon', 'Infernus firepike']),
        ],
      },
    ])

    expect(kindsOf(index).map((kind) => kind.name)).toEqual(['Custodian w/ gauntlet and bolter', 'Custodian w/ talon and firepike'])
  })

  it('leaves loadouts two of which carry the same weapon as the catalogue wrote them', () => {
    const index = squadOf([
      {
        id: 'models',
        name: 'Warriors',
        models: [
          loadout('flayer', 'Warrior w/ gauss flayer', ['Gauss flayer']),
          loadout('spare', 'Warrior w/ spare gauss flayer', ['Gauss flayer']),
        ],
      },
    ])

    expect(kindsOf(index).map((kind) => kind.name)).toEqual(['Warrior w/ gauss flayer', 'Warrior w/ spare gauss flayer'])
  })

  /** Nothing gathers models the catalogue does name a profile for. */
  it('keeps a kind the catalogue names a profile for apart from the rest', () => {
    const index = squadOf([
      {
        id: 'models',
        name: 'Warriors',
        models: [
          loadout('leader', 'Warrior w/ staff', ['Staff', 'Close combat weapon'], 'Leader'),
          loadout('flayer', 'Warrior w/ gauss flayer', ['Gauss flayer', 'Close combat weapon']),
          loadout('reaper', 'Warrior w/ gauss reaper', ['Gauss reaper', 'Close combat weapon']),
        ],
      },
    ])

    expect(kindsOf(index).map((kind) => kind.name)).toEqual(['Warrior w/ staff', 'Warrior'])
  })
})

/**
 * A group is not in the selection tree until something is put in it, and the heavy
 * weapon a squad may take is exactly that: an optional group, nested inside the group
 * holding the squad, empty until a player asks for one. Asked for, the request went
 * nowhere — the walk to the group only ever stepped through models already standing
 * there — so a Hearthkyn Warriors squad could never take its magna-rail rifle.
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
