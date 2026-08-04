import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { defaultSelection, withCounts } from './roster'

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
