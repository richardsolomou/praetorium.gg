import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { buildUnit, defaultSelection, unitSize, withCounts } from './roster'

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

  it('clamps a size the data does not allow', () => {
    expect(buildUnit('squad', indexOf(squad()), 99)?.size.models).toBe(10)
  })

  it('treats a lone character as one model', () => {
    const index = indexOf({ sharedSelectionEntries: [{ id: 'captain', name: 'Captain', type: 'model' }] })
    expect(unitSize('captain', index)).toMatchObject({ min: 1, max: 1, models: 1 })
  })
})
