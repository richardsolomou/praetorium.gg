import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile, type Constraint } from './catalogue'
import { modelKindsOf, optionWargear } from './modelKinds'
import { buildUnit } from './roster'
import { allAt } from './selection'
import { wargearOf } from './wargear'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const mandatory = (id: string) => [{ id, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }]

it('totals wargear across repeated selections of one option', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Bike Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'models',
            name: 'Models',
            defaultSelectionEntryId: 'bike',
            constraints: [
              { id: 'models-min', type: 'min', value: 3, field: 'selections', scope: 'parent' },
              { id: 'models-max', type: 'max', value: 3, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'bike',
                name: 'Bike',
                type: 'model',
                selectionEntries: [
                  { id: 'bolt-pistol', name: 'Bolt pistol', type: 'upgrade', constraints: mandatory('pistol-min') },
                  { id: 'twin-bolter', name: 'Twin bolter', type: 'upgrade', collective: true, constraints: mandatory('bolter-min') },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  const selected = allAt(buildUnit('squad', index)!.selection, ['models', 'bike'])

  expect(optionWargear('bike', index, {}, selected)).toEqual([
    { name: 'Bolt pistol', count: 3 },
    { name: 'Twin bolter', count: 3 },
  ])
})

it('separates a champion whose mandatory weapon can take an additional copy', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Terminators',
        type: 'unit',
        selectionEntries: [
          {
            id: 'champion',
            name: 'Terminator Champion',
            type: 'model',
            constraints: mandatory('champion-min'),
            entryLinks: [
              { id: 'champion-blade', targetId: 'blade', type: 'selectionEntry' },
              {
                id: 'champion-gauntlet',
                targetId: 'gauntlet',
                type: 'selectionEntry',
                modifiers: [{ type: 'set', field: 'gauntlet-max', value: 2 }],
              },
              { id: 'champion-icon', targetId: 'icon', type: 'selectionEntry' },
            ],
          },
        ],
        selectionEntryGroups: [
          {
            id: 'terminators',
            name: 'Terminators',
            constraints: [
              { id: 'terminators-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
              { id: 'terminators-max', type: 'max', value: 5, field: 'selections', scope: 'parent' },
            ],
            selectionEntries: [
              {
                id: 'terminator',
                name: 'Terminator',
                type: 'model',
                constraints: [
                  { id: 'terminator-min', type: 'min', value: 2, field: 'selections', scope: 'parent' },
                  { id: 'terminator-max', type: 'max', value: 5, field: 'selections', scope: 'parent' },
                ],
                entryLinks: [
                  { id: 'terminator-blade', targetId: 'blade', type: 'selectionEntry' },
                  { id: 'terminator-gauntlet', targetId: 'gauntlet', type: 'selectionEntry' },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'blade',
        name: 'Blade',
        type: 'upgrade',
        constraints: [
          { id: 'blade-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
          { id: 'blade-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
        ],
      },
      {
        id: 'gauntlet',
        name: 'Gauntlet',
        type: 'upgrade',
        constraints: [
          { id: 'gauntlet-min', type: 'min', value: 1, field: 'selections', scope: 'parent' },
          { id: 'gauntlet-max', type: 'max', value: 1, field: 'selections', scope: 'parent' },
        ],
      },
      {
        id: 'icon',
        name: 'Icon',
        type: 'upgrade',
        constraints: [{ id: 'icon-max', type: 'max', value: 1, field: 'selections', scope: 'parent' }],
      },
    ],
  })
  const built = buildUnit('squad', index)!

  expect(built.choices).toContainEqual(
    expect.objectContaining({
      key: 'champion/champion-gauntlet',
      owner: expect.objectContaining({ name: 'Terminator Champion' }),
      options: [expect.objectContaining({ id: 'champion-gauntlet', count: 1, min: 1, max: 2 })],
    }),
  )
  expect(modelKindsOf('squad', built.selection, index).map((kind) => kind.name)).toEqual(['Terminator Champion', 'Terminator'])
  const armed = buildUnit('squad', index, undefined, undefined, {
    spreads: { 'champion/champion-gauntlet': { 'champion-gauntlet': 2 } },
  })!
  expect(armed.choices.find((choice) => choice.key === 'champion/champion-gauntlet')?.options[0]?.count).toBe(2)
  expect(wargearOf(armed.selection, index)).toContainEqual({ name: 'Gauntlet', count: 4 })
})

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
 * A model the data insists on is no choice, so nothing reading the choices reports it.
 * Read that way, an Eradicator Squad was two Eradicators and no sergeant: the one model
 * the squad cannot be without was the one model its datasheet never drew.
 */
describe('models the datasheet stands in the unit itself', () => {
  const model = (id: string, name: string, weapons: readonly string[], profile: string, constraints: Constraint[]) => ({
    id,
    name,
    type: 'model' as const,
    profiles: [{ id: `${id}-profile`, name: profile, typeName: 'Unit' }],
    constraints,
    selectionEntries: weapons.map((weapon, position) => ({
      id: `${id}-${position}`,
      name: weapon,
      type: 'upgrade' as const,
      constraints: mandatory(`${id}-${position}-min`),
    })),
  })

  const bounded = (id: string, minimum: number, maximum: number): Constraint[] => [
    { id: `${id}-min`, type: 'min', value: minimum, field: 'selections', scope: 'parent' },
    { id: `${id}-max`, type: 'max', value: maximum, field: 'selections', scope: 'parent' },
  ]

  const squad = indexOf({
    sharedSelectionEntries: [
      {
        id: 'squad',
        name: 'Eradicator Squad',
        type: 'unit',
        selectionEntryGroups: [
          {
            id: 'models',
            name: 'Eradicators',
            constraints: bounded('models', 3, 6),
            selectionEntries: [
              model('sergeant', 'Eradicator Sergeant', ['Melta rifle', 'Bolt pistol'], 'Eradicator Sergeant', bounded('sergeant', 1, 1)),
              model('trooper', 'Eradicator', ['Melta rifle', 'Bolt pistol'], 'Eradicator Squad', bounded('trooper', 0, 5)),
              model('melta', 'Eradicator with Multi-melta', ['Multi-melta', 'Bolt pistol'], 'Eradicator Squad', bounded('melta', 0, 1)),
            ],
          },
        ],
      },
    ],
  })

  const kinds = modelKindsOf('squad', buildUnit('squad', squad)!.selection, squad)

  it('draws a model the squad cannot be without, counted from the selection', () => {
    expect(kinds.map((kind) => kind.name)).toEqual(['Eradicator Sergeant', 'Eradicator'])
    expect(kinds[0]?.members).toEqual([{ id: 'sergeant', choiceKey: null, baseCount: 1 }])
    expect(kinds[0]?.fixed.map((piece) => piece.name)).toEqual(['Melta rifle', 'Bolt pistol'])
  })

  /** Nothing about him is the player's to change, so he holds no row and no choice. */
  it('leaves such a model no rows to pick between', () => {
    expect(kinds[0]?.rows).toEqual([])
  })

  it('lists the pieces inside a composite wargear option', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'composite-squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'veteran',
              name: 'Veteran',
              type: 'model',
              profiles: [{ id: 'veteran-profile', name: 'Veteran', typeName: 'Unit' }],
              constraints: mandatory('veteran-min'),
              selectionEntryGroups: [
                {
                  id: 'weapon',
                  name: 'Weapon',
                  defaultSelectionEntryId: 'hammer',
                  constraints: bounded('weapon', 1, 1),
                  selectionEntries: [
                    {
                      id: 'hammer',
                      name: 'Heavy thunder hammer',
                      type: 'upgrade',
                      profiles: [{ id: 'hammer-profile', name: 'Heavy thunder hammer' }],
                    },
                    {
                      id: 'sword-and-shield',
                      name: 'Power weapon and Astartes shield',
                      type: 'upgrade',
                      selectionEntries: [
                        { id: 'sword', name: 'Power weapon', type: 'upgrade', constraints: mandatory('sword-min') },
                        { id: 'shield', name: 'Astartes shield', type: 'upgrade', constraints: mandatory('shield-min') },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          selectionEntryGroups: [
            {
              id: 'extras',
              name: 'Extras',
              constraints: bounded('extras', 0, 1),
              selectionEntries: [
                { id: 'banner', name: 'Banner', type: 'upgrade' },
                { id: 'relic', name: 'Relic', type: 'upgrade' },
              ],
            },
          ],
        },
      ],
    })
    const rows = modelKindsOf('composite-squad', buildUnit('composite-squad', index)!.selection, index).flatMap((kind) => kind.rows)

    expect(rows.map((row) => [row.name, row.optionId, row.pieces])).toEqual([
      ['Heavy thunder hammer', 'hammer', undefined],
      ['Power weapon and Astartes shield', 'sword-and-shield', ['Power weapon', 'Astartes shield']],
    ])
  })

  it("leaves a model's default answer to a choice it owns out of its fixed wargear", () => {
    // A sergeant's default laspistol and chainsword are one of the combinations below,
    // not something he carries whatever is chosen beside them.
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'troops',
          name: 'Shock Troops',
          type: 'unit',
          selectionEntries: [
            {
              id: 'trooper',
              name: 'Shock Trooper',
              type: 'model',
              profiles: [{ id: 'trooper-profile', name: 'Shock Trooper', typeName: 'Unit' }],
              constraints: bounded('trooper', 4, 9),
              selectionEntryGroups: [
                {
                  id: 'trooper-weapon',
                  name: 'Weapon',
                  defaultSelectionEntryId: 'lasgun',
                  constraints: bounded('trooper-weapon', 1, 1),
                  selectionEntries: [
                    { id: 'lasgun', name: 'Lasgun', type: 'upgrade' },
                    { id: 'flamer', name: 'Flamer', type: 'upgrade' },
                  ],
                },
              ],
            },
            {
              id: 'sergeant',
              name: 'Sergeant',
              type: 'model',
              profiles: [{ id: 'sergeant-profile', name: 'Sergeant', typeName: 'Unit' }],
              constraints: mandatory('sergeant-min'),
              selectionEntries: [{ id: 'grenades', name: 'Frag grenades', type: 'upgrade', constraints: mandatory('grenades-min') }],
              selectionEntryGroups: [
                {
                  id: 'options',
                  name: 'Wargear Options',
                  defaultSelectionEntryId: 'laspistol-and-chainsword',
                  constraints: bounded('options', 1, 1),
                  selectionEntries: [
                    {
                      id: 'laspistol-and-chainsword',
                      name: 'Laspistol and chainsword',
                      type: 'upgrade',
                      selectionEntries: [
                        { id: 'laspistol', name: 'Laspistol', type: 'upgrade', constraints: mandatory('laspistol-min') },
                        { id: 'chainsword', name: 'Chainsword', type: 'upgrade', constraints: mandatory('chainsword-min') },
                      ],
                    },
                    {
                      id: 'bolt-pistol-and-chainsword',
                      name: 'Bolt pistol and chainsword',
                      type: 'upgrade',
                      selectionEntries: [
                        { id: 'bolt-pistol', name: 'Bolt pistol', type: 'upgrade', constraints: mandatory('bolt-pistol-min') },
                        { id: 'chainsword-2', name: 'Chainsword', type: 'upgrade', constraints: mandatory('chainsword-2-min') },
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
    const sergeant = modelKindsOf('troops', buildUnit('troops', index)!.selection, index).find((kind) => kind.name === 'Sergeant')

    expect(sergeant?.fixed.map((piece) => piece.name)).toEqual(['Frag grenades'])
    expect(sergeant?.rows.map((row) => row.name)).toEqual(['Laspistol and chainsword', 'Bolt pistol and chainsword'])
  })

  /**
   * The rank and file are one kind however the catalogue files their weapons, and the
   * plain entry beside the loadouts is what they are called. The profile is no help:
   * an eleventh-edition datasheet names it after the squad.
   */
  it('gathers the rank and file with the loadouts one of them may take', () => {
    expect(kinds[1]?.members).toEqual([
      { id: 'trooper', choiceKey: 'models', baseCount: 0 },
      { id: 'melta', choiceKey: 'models', baseCount: 0 },
    ])
    expect(kinds[1]?.rows.map((row) => row.name)).toEqual(['Melta rifle', 'Multi-melta'])
  })

  /**
   * A group offering one model and insisting on it asks the player nothing, so it is
   * reported as no choice at all — and the Fire Coordinator standing in a Krieg Heavy
   * Weapons Squad was drawn nowhere.
   */
  const heavyWeapons = (extras: Catalogue['sharedSelectionEntryGroups'] = []) =>
    indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Heavy Weapons Squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'gunners',
              name: 'Gunners',
              constraints: bounded('gunners', 2, 2),
              selectionEntries: [
                model('lascannon', 'Gunner w/ lascannon', ['Lascannon'], 'Gunner', bounded('lascannon', 0, 2)),
                model('mortar', 'Gunner w/ mortar', ['Mortar'], 'Gunner', bounded('mortar', 0, 2)),
              ],
            },
            ...extras,
          ],
        },
      ],
    })

  it('draws a model whose group leaves the player nothing to answer', () => {
    const index = heavyWeapons([
      {
        id: 'coordinator',
        name: 'Fire Coordinator',
        selectionEntries: [model('fire', 'Fire Coordinator', ['Laspistol'], 'Fire Coordinator', bounded('fire', 1, 1))],
      },
    ])

    expect(modelKindsOf('squad', buildUnit('squad', index)!.selection, index).map((kind) => kind.name)).toEqual([
      'Fire Coordinator',
      'Gunner',
    ])
  })

  /**
   * A catalogue can bundle a whole squad size into one upgrade — a Jakhals pack is
   * written as "8 chainblades", with the eight Jakhals inside it — so the models are
   * a level below anything a choice names. Only the bundle the squad took: the models
   * inside the ones it passed over are cards for a squad it is not.
   */
  it('draws the models inside the bundle the squad took, and no others', () => {
    const index = heavyWeapons([
      {
        id: 'pack',
        name: 'Pack',
        defaultSelectionEntryId: 'eight',
        constraints: bounded('pack', 1, 1),
        selectionEntries: [
          {
            id: 'eight',
            name: '8 chainblades',
            type: 'upgrade',
            selectionEntries: [model('jakhal', 'Jakhal', ['Chainblades'], 'Jakhal', bounded('jakhal', 8, 8))],
          },
          {
            id: 'four',
            name: '4 mauler chainblades',
            type: 'upgrade',
            selectionEntries: [model('mauler', 'Jakhal w/ mauler chainblade', ['Mauler chainblade'], 'Mauler', bounded('mauler', 4, 4))],
          },
        ],
      },
    ])
    const packed = modelKindsOf('squad', buildUnit('squad', index)!.selection, index)

    expect(packed.map((kind) => kind.name)).toEqual(['Jakhal', 'Gunner'])
    expect(packed[0]?.members).toEqual([{ id: 'jakhal', choiceKey: null, baseCount: 8 }])
  })

  /**
   * A datasheet whose loadouts are fixed per squad size asks the player nothing at all,
   * and the rules source describes it better — it names the weapons and abilities a
   * card needs. Standing models are what completes a set of cards, not what starts one,
   * so saying nothing here is still how that reading gets asked for.
   */
  it('says nothing about a datasheet that offers no choice at all', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'squad',
          name: 'Ancestor Guard',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'models',
              name: 'Guard',
              constraints: bounded('models', 1, 1),
              selectionEntries: [model('guard', 'Ancestor', ['Rifle'], 'Ancestor', bounded('guard', 1, 1))],
            },
          ],
        },
      ],
    })

    expect(modelKindsOf('squad', buildUnit('squad', index)!.selection, index)).toEqual([])
  })
})
