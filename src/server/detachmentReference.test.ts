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

it('shows unit upgrade eligibility when the catalogue only describes the effect', () => {
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
            selectionEntries: [{ id: 'skyshroud', name: 'Skyshroud Spearhead', type: 'upgrade' }],
          },
        ],
      },
      ...[
        { id: 'madness', name: 'Deepening Madness', effect: 'This unit’s ranged attacks have [ASSAULT].' },
        { id: 'reanimation', name: 'Recursive Reanimation', effect: 'When this unit reanimates, +1 to the roll.' },
      ].map(({ id, name, effect }) => ({
        id,
        name,
        type: 'upgrade' as const,
        profiles: [{ id: `${id}-ability`, name, characteristics: [{ name: 'Description', $text: effect }] }],
      })),
    ],
  })
  const rules = {
    attribution: 'Community data',
    factionKeys: new Map(),
    detachmentReferences: new Map([
      ['test-catalogue', new Map([['skyshroud-spearhead', { enhancements: 0, upgrades: 2, stratagems: 0, points: 1, dispositions: [] }]])],
    ]),
    detachmentDetails: new Map([
      [
        'test-catalogue',
        new Map([
          [
            'skyshroud-spearhead',
            {
              id: 'skyshroud-spearhead',
              name: 'Skyshroud Spearhead',
              points: 1,
              dispositions: [],
              rules: [],
              enhancements: [],
              upgrades: [
                {
                  name: 'Deepening Madness',
                  points: 20,
                  description: '**Destroyer Cult Mounted** unit only. This unit’s ranged attacks have **[ASSAULT]**.',
                },
                {
                  name: 'Recursive Reanimation',
                  points: 5,
                  description: '**Tomb Blades** unit only. When this unit reanimates, +1 to the roll.',
                },
              ],
              stratagems: [],
            },
          ],
        ]),
      ],
    ]),
    dispositions: new Map(),
  } as Partial<LoadedRules> as LoadedRules

  expect(detachmentReference(loaded, rules, 'cat', 'skyshroud-spearhead')?.upgrades).toEqual([
    {
      name: 'Deepening Madness',
      points: 20,
      description: '**Destroyer Cult Mounted** unit only. This unit’s ranged attacks have [ASSAULT].',
    },
    {
      name: 'Recursive Reanimation',
      points: 5,
      description: '**Tomb Blades** unit only. When this unit reanimates, +1 to the roll.',
    },
  ])
})
