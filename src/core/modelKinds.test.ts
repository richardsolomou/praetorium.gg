import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile, type Constraint } from './catalogue'
import { modelKindsOf } from './modelKinds'
import { buildUnit } from './roster'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

const mandatory = (id: string) => [{ id, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' }]

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
