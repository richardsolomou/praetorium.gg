import { expect, it } from 'vitest'
import type { NamedCatalogueFile } from './cataloguePartitions'
import { cataloguePartitions } from './cataloguePartitions'

const files: NamedCatalogueFile[] = [
  { name: 'system.json', file: { gameSystem: { id: 'system', name: 'System' } } },
  {
    name: 'army.json',
    file: {
      catalogue: {
        id: 'army',
        name: 'Army',
        selectionEntries: [
          {
            id: 'unit',
            type: 'unit',
            selectionEntries: [{ id: 'model', type: 'model', entryLinks: [{ id: 'weapon-link', targetId: 'weapon' }] }],
          },
        ],
      },
    },
  },
  {
    name: 'library.json',
    file: { catalogue: { id: 'library', name: 'Library', library: true, selectionEntries: [{ id: 'weapon', type: 'upgrade' }] } },
  },
  { name: 'other.json', file: { catalogue: { id: 'other', name: 'Other' } } },
]

it('includes the game system and transitive definition owners for an army', () => {
  expect(cataloguePartitions(files).get('army')).toEqual(['army.json', 'library.json', 'system.json'])
})

it('keeps unrelated armies out of a partition', () => {
  expect(cataloguePartitions(files).get('other')).toEqual(['other.json', 'system.json'])
})
