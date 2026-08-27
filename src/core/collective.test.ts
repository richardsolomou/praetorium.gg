import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { isCollectiveGroup, scaleOf, storesUnitTotal } from './collective'

const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: 'pts', name: 'pts' }] } }
const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

describe('what a stored count means', () => {
  const index = indexOf({
    sharedSelectionEntries: [
      { id: 'blaster', name: 'Gauss blaster', type: 'upgrade', collective: true },
      { id: 'knife', name: 'Combat knife', type: 'upgrade' },
      {
        id: 'squad',
        name: 'Squad',
        type: 'unit',
        selectionEntryGroups: [
          { id: 'guns', name: 'Guns', entryLinks: [{ id: 'blaster-link', targetId: 'blaster', type: 'selectionEntry' }] },
          { id: 'knives', name: 'Knives', entryLinks: [{ id: 'knife-link', targetId: 'knife', type: 'selectionEntry' }] },
        ],
      },
    ],
  })
  const entry = (id: string) => index.definitions.get(id)!

  it('reads a collective entry as the unit total, through the link that reaches it', () => {
    expect(storesUnitTotal(entry('blaster-link'), entry('guns'), index)).toBe(true)
  })

  it('reads every option of a group holding a collective one as a unit total', () => {
    expect(isCollectiveGroup(entry('guns'), index)).toBe(true)
    expect(isCollectiveGroup(entry('knives'), index)).toBe(false)
  })

  it("reads anything else as one model's share", () => {
    expect(storesUnitTotal(entry('knife-link'), entry('knives'), index)).toBe(false)
  })

  it('scales a per-model constraint by the carriers only for a unit total', () => {
    expect([scaleOf(entry('blaster-link'), index, 10), scaleOf(entry('guns'), index, 10), scaleOf(entry('knife-link'), index, 10)]).toEqual(
      [10, 10, 1],
    )
  })
})
