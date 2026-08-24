import { describe, expect, it } from 'vitest'
import { buildIndex, type Catalogue, type CatalogueFile } from './catalogue'
import { wargearOf } from './wargear'

const PTS = 'cost-pts'
const system: CatalogueFile = { gameSystem: { id: 'gs', name: 'Test', costTypes: [{ id: PTS, name: 'pts' }] } }

const indexOf = (catalogue: Partial<Catalogue>) =>
  buildIndex([system, { catalogue: { id: 'cat', name: 'Test catalogue', ...catalogue } }], 'test-revision')

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

  it('keeps a described weapon when it holds a selected upgrade', () => {
    const index = indexOf({
      sharedSelectionEntries: [
        {
          id: 'overlord',
          name: 'Overlord',
          type: 'model',
          selectionEntries: [
            {
              id: 'blade',
              name: "Overlord's blade",
              type: 'upgrade',
              profiles: [{ id: 'blade-profile', name: "Overlord's blade", typeName: 'Melee Weapons' }],
              selectionEntries: [{ id: 'orb', name: 'Resurrection orb', type: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const selection = {
      id: 'overlord',
      selections: [{ id: 'blade', selections: [{ id: 'orb', count: 1 }] }],
    }
    expect(wargearOf(selection, index)).toEqual([
      { name: "Overlord's blade", count: 1 },
      { name: 'Resurrection orb', count: 1 },
    ])
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

  it('finds wargear inside a deeply nested selected option', () => {
    const index = indexOf({ sharedSelectionEntries: [{ id: 'shield', name: 'Astartes shield', type: 'upgrade' }] })
    const selection = {
      id: 'squad',
      selections: [
        {
          id: 'composition',
          selections: [
            {
              id: 'models',
              selections: [
                { id: 'veteran', selections: [{ id: 'weapon', selections: [{ id: 'option', selections: [{ id: 'shield' }] }] }] },
              ],
            },
          ],
        },
      ],
    }

    expect(wargearOf(selection, index)).toEqual([{ name: 'Astartes shield', count: 1 }])
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
