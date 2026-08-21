import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
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
 * A group is not in the selection tree until something is put in it, and the heavy
 * weapon a squad may take is exactly that: an optional group, nested inside the group
 * holding the squad, empty until a player asks for one. Asked for, the request went
 * nowhere — the walk to the group only ever stepped through models already standing
 * there — so a Hearthkyn Warriors squad could never take its magna-rail rifle.
 */
