import { expect, it } from 'vitest'
import type { LoadedRules } from './rules'
import { bookOf } from './catalogue.fixtures'
import { detachmentReference } from './detachmentReference'

it('appends catalogue-only keyword definitions to detachment rule cards', () => {
  const loaded = bookOf({
    sharedSelectionEntries: [
      {
        id: 'wrapper',
        name: 'Detachment',
        type: 'upgrade',
        selectionEntryGroups: [
          {
            id: 'choices',
            name: 'Detachment',
            selectionEntries: [
              {
                id: 'armoured-infantry',
                name: 'Armoured Infantry',
                type: 'upgrade',
                rules: [
                  { id: 'command', name: 'Squadron Command', description: 'Catalogue command.' },
                  { id: 'keywords', name: 'Keywords', description: 'Units gain the Armoured Skirmisher keyword.' },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  const detail = {
    id: 'armoured-infantry',
    name: 'Armoured Infantry',
    points: 2,
    dispositions: [],
    rules: [
      { name: 'Squadron Command', description: 'Card command.' },
      { name: 'Order', description: 'On My Signal.' },
    ],
    enhancements: [],
    upgrades: [],
    stratagems: [],
  }
  const rules = {
    attribution: 'Community data',
    factionKeys: new Map(),
    detachmentReferences: new Map([
      ['test-catalogue', new Map([['armoured-infantry', { enhancements: 0, upgrades: 0, stratagems: 0, points: 2, dispositions: [] }]])],
    ]),
    detachmentDetails: new Map([['test-catalogue', new Map([['armoured-infantry', detail]])]]),
    dispositions: new Map(),
  } as Partial<LoadedRules> as LoadedRules

  expect(detachmentReference(loaded, rules, 'cat', 'armoured-infantry')?.rules).toEqual([
    { name: 'Squadron Command', description: 'Card command.' },
    { name: 'Order', description: 'On My Signal.' },
    { name: 'Keywords', description: 'Units gain the Armoured Skirmisher keyword.' },
  ])
})
