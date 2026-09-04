import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { evaluate } from './evaluate'
import { defaultSelection } from './expand'
import { buildUnit } from './roster'
import { modelCountOf } from './unitSize'
import { wargearOf } from './wargear'

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

  it('reaches a required weapon group under a model inside a composition group', () => {
    // A Firestrike Servo-Turret's weapon sits five containers below its datasheet.
    // Stopping short of it left the group empty and the unit illegal on arrival,
    // with the choice already made and nothing for the player to answer.
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'turrets',
          name: 'Turrets',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Turrets',
              selectionEntries: [
                {
                  id: 'turret',
                  name: 'Turret',
                  type: 'model',
                  constraints: mandatory('turret-min'),
                  selectionEntryGroups: [
                    {
                      id: 'wargear',
                      name: 'Wargear',
                      selectionEntryGroups: [
                        {
                          id: 'weapon',
                          name: 'Weapon Option',
                          constraints: mandatory('weapon-min'),
                          selectionEntries: [
                            { id: 'talon', name: 'Las-talon', type: 'upgrade' },
                            { id: 'autocannon', name: 'Autocannon', type: 'upgrade' },
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
    expect(evaluate([defaultSelection('turrets', index)!], index).errors).toEqual([])
  })
})

describe('a group that requires selections', () => {
  const group = (
    requirement: number,
    options: { id: string; name: string; min?: number; max?: number; points?: number }[],
  ): Partial<Catalogue> => ({
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
              constraints: [
                ...(option.min === undefined
                  ? []
                  : [{ id: `${option.id}-min`, type: 'min' as const, value: option.min, field: 'selections', scope: 'parent' }]),
                ...(option.max === undefined
                  ? []
                  : [{ id: `${option.id}-max`, type: 'max' as const, value: option.max, field: 'selections', scope: 'parent' }]),
              ],
            })),
          },
        ],
      },
    ],
  })

  const withDefault = (catalogue: Partial<Catalogue>, optionId: string): Partial<Catalogue> => {
    const squad = catalogue.sharedSelectionEntries?.[0]
    const wargear = squad?.selectionEntryGroups?.[0]
    if (!squad || !wargear) throw new Error('fixture lost its wargear group')
    return {
      ...catalogue,
      sharedSelectionEntries: [{ ...squad, selectionEntryGroups: [{ ...wargear, defaultSelectionEntryId: optionId }] }],
    }
  }

  const chosen = (catalogue: Partial<Catalogue>) =>
    defaultSelection('squad', indexOf(catalogue))?.selections?.[0]?.selections?.map((child) => ({ id: child.id, count: child.count }))

  it('fills the group rather than leaving it empty', () => {
    // The requirement belongs to what goes inside a group, never to the group
    // itself: putting the number on the group left squads with no models in them.
    expect(chosen(group(4, [{ id: 'knife', name: 'Knife' }]))).toEqual([{ id: 'knife', count: 4 }])
  })

  it('fills the slots beyond an option own minimum', () => {
    expect(chosen(group(9, [{ id: 'trooper', name: 'Trooper', min: 6, max: 9 }]))).toEqual([{ id: 'trooper', count: 9 }])
  })

  it('fields the whole squad when a sergeant is reserved before the ranks are shared out', () => {
    // A Terminator Squad of five is one sergeant and four Terminators. Charging the
    // sergeant's own minimum against the group's allowance as well as reserving it
    // left the squad one body short and illegal the moment it was added.
    expect(
      chosen(
        group(5, [
          { id: 'sergeant', name: 'Sergeant', min: 1, max: 1 },
          { id: 'terminator', name: 'Terminator', max: 9 },
        ]),
      ),
    ).toEqual([
      { id: 'sergeant', count: 1 },
      { id: 'terminator', count: 4 },
    ])
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

  it('takes the cheapest option even when the group names a costlier default', () => {
    const catalogue = withDefault(
      group(1, [
        { id: 'lance', name: 'Lance', points: 5 },
        { id: 'blade', name: 'Blade', points: 0 },
      ]),
      'lance',
    )
    expect(chosen(catalogue)).toEqual([{ id: 'blade', count: 1 }])
  })

  it('stops at the option that settles the requirement its own absence raised', () => {
    // A Wrack Acothyst takes either the twin tools or one ranged and one melee
    // weapon, written as a limit of two that drops to one once the twin is taken.
    // Reading the limit while the group was empty took the twin and a weapon too.
    const bound = (id: string, type: 'min' | 'max', value: number) => ({ id, type, value, field: 'selections', scope: 'parent' })
    const withoutTwin = [{ type: 'lessThan' as const, value: 1, field: 'selections', scope: 'parent', childId: 'twin' }]
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'acothyst',
          name: 'Acothyst',
          type: 'model',
          selectionEntryGroups: [
            {
              id: 'options',
              name: 'Weapon Options',
              defaultSelectionEntryId: 'twin',
              constraints: [bound('options-min', 'min', 1), bound('options-max', 'max', 1)],
              modifiers: [
                { type: 'set', value: 2, field: 'options-min', conditions: withoutTwin },
                { type: 'set', value: 2, field: 'options-max', conditions: withoutTwin },
              ],
              selectionEntries: [{ id: 'twin', name: 'Twin tools', type: 'upgrade', constraints: [bound('twin-max', 'max', 1)] }],
              selectionEntryGroups: [
                {
                  id: 'ranged',
                  name: 'Ranged Weapon',
                  constraints: [bound('ranged-max', 'max', 1)],
                  selectionEntries: [{ id: 'pistol', name: 'Pistol', type: 'upgrade', constraints: [bound('pistol-max', 'max', 1)] }],
                },
              ],
            },
          ],
        },
      ],
    })
    const built = defaultSelection('acothyst', index)!
    expect({
      held: built.selections?.[0]?.selections?.map((child) => child.id),
      errors: evaluate([built], index).errors,
    }).toEqual({ held: ['twin'], errors: [] })
  })

  it('prefers what the group names as its default between options that cost the same', () => {
    const catalogue = withDefault(
      group(1, [
        { id: 'lance', name: 'Lance', points: 0 },
        { id: 'blade', name: 'Blade', points: 0 },
      ]),
      'blade',
    )
    expect(chosen(catalogue)).toEqual([{ id: 'blade', count: 1 }])
  })
})

describe('a per-model weapon choice the squad shares a cap on', () => {
  // A Ravenwing Command Squad equips all three models with a plasma talon, and only
  // one of them may replace it with an Astartes grenade launcher. Nothing else says
  // which is the replacement: each group names a default the catalogue never defines.
  const bound = (id: string, type: 'min' | 'max', value: number, scope = 'parent') => ({ id, type, value, field: 'selections', scope })

  const squad = (defaultOptionId?: string): Partial<Catalogue> => ({
    sharedSelectionEntries: [
      { id: 'launcher', name: 'Grenade launcher', type: 'upgrade' },
      { id: 'talon', name: 'Plasma talon', type: 'upgrade' },
      {
        id: 'squad',
        name: 'Command Squad',
        type: 'unit',
        selectionEntries: ['ancient', 'apothecary', 'champion'].map((model) => ({
          id: model,
          name: model,
          type: 'model' as const,
          constraints: [bound(`${model}-min`, 'min', 1), bound(`${model}-max`, 'max', 1)],
          selectionEntryGroups: [
            {
              id: `${model}-weapon`,
              name: 'Plasma Talon Replacement',
              defaultSelectionEntryId: defaultOptionId && `${model}-${defaultOptionId}`,
              constraints: [bound(`${model}-weapon-min`, 'min', 1), bound(`${model}-weapon-max`, 'max', 1)],
              entryLinks: [
                {
                  id: `${model}-launcher`,
                  name: 'Grenade launcher',
                  type: 'selectionEntry' as const,
                  targetId: 'launcher',
                  constraints: [{ ...bound(`${model}-launcher-max`, 'max', 1, 'unit'), includeChildSelections: true }],
                },
                {
                  id: `${model}-talon`,
                  name: 'Plasma talon',
                  type: 'selectionEntry' as const,
                  targetId: 'talon',
                  constraints: [bound(`${model}-talon-max`, 'max', 1)],
                },
              ],
            },
          ],
        })),
      },
    ],
  })

  it('equips every model with the option nothing counts across the unit', () => {
    const index = indexOf(squad())
    expect(wargearOf(defaultSelection('squad', index)!, index)).toEqual([{ name: 'Plasma talon', count: 3 }])
  })

  it('hands the player a squad the same data accepts', () => {
    const index = indexOf(squad())
    expect(evaluate([defaultSelection('squad', index)!], index).errors).toEqual([])
  })

  it('still takes the option a group names as its default', () => {
    const index = indexOf(squad('launcher'))
    expect(wargearOf(defaultSelection('squad', index)!, index)).toEqual([{ name: 'Grenade launcher', count: 3 }])
  })
})
