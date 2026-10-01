import { expect, it } from 'vitest'
import type { LoadedRules } from './rules'
import { bookOf, withCards } from './catalogue.fixtures'
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

it('shows the linked weapon profile when an enhancement ends by naming its weapon', () => {
  const loaded = bookOf({
    sharedSelectionEntries: [
      {
        id: 'wrapper',
        name: 'Detachment',
        type: 'upgrade',
        selectionEntryGroups: [
          { id: 'choices', name: 'Detachment', selectionEntries: [{ id: 'assault', name: 'Assault Brethren', type: 'upgrade' }] },
        ],
      },
      {
        id: 'imperiums-sword',
        name: "Imperium's Sword",
        type: 'upgrade',
        profiles: [
          {
            id: 'sword-ability',
            name: "Imperium's Sword",
            characteristics: [{ name: 'Description', $text: 'This model has the following weapon:' }],
          },
        ],
        entryLinks: [{ id: 'sword-weapon-link', name: "Imperium's Sword", type: 'selectionEntry', targetId: 'sword-weapon' }],
      },
      {
        id: 'sword-weapon',
        name: "Imperium's Sword",
        type: 'upgrade',
        profiles: [
          {
            id: 'sword-profile',
            name: "Imperium's Sword",
            typeName: 'Melee Weapons',
            characteristics: [
              { name: 'Range', $text: 'Melee' },
              { name: 'A', $text: '6' },
              { name: 'WS', $text: '2+' },
              { name: 'S', $text: '7' },
              { name: 'AP', $text: '-3' },
              { name: 'D', $text: '3' },
            ],
          },
        ],
      },
    ],
  })
  const rules = {
    attribution: 'Community data',
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map([
      [
        'test-catalogue',
        new Map([
          [
            'assault-brethren',
            {
              id: 'assault',
              name: 'Assault Brethren',
              points: 1,
              dispositions: [],
              rules: [],
              enhancements: [
                { name: "Imperium's Sword", points: 20, description: 'This model has the following weapon:', keywordRestrictions: [] },
              ],
              upgrades: [],
              stratagems: [],
            },
          ],
        ]),
      ],
    ]),
    dispositions: new Map(),
  } as Partial<LoadedRules> as LoadedRules

  expect(detachmentReference(loaded, rules, 'cat', 'assault-brethren')?.enhancements[0]?.description).toBe(
    "This model has the following weapon:\n\n**Imperium's Sword** — Range Melee · A 6 · WS 2+ · S 7 · AP -3 · D 3",
  )
})

it('shows offered catalogue rules and points when the chapter has no detachment card', () => {
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
                id: 'anvil',
                name: 'Anvil Siege Force',
                type: 'upgrade',
                costs: [{ name: 'Detachment Points', typeId: 'dp', value: 2 }],
                rules: [{ id: 'shield', name: 'Shield of the Imperium', description: 'Hold the line.' }],
              },
            ],
          },
        ],
      },
    ],
  })
  loaded.index.costTypes.set('dp', { id: 'dp', name: 'Detachment Points' })
  const rules = {
    attribution: 'Community data',
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map(),
    dispositions: new Map(),
  } as Partial<LoadedRules> as LoadedRules

  expect(detachmentReference(loaded, rules, 'cat', 'anvil-siege-force')).toMatchObject({
    name: 'Anvil Siege Force',
    points: 2,
    rules: [{ name: 'Shield of the Imperium', description: 'Hold the line.' }],
    enhancements: [],
    stratagems: [],
  })
})

it('shows a faction-scoped shared card for an offered chapter copy', () => {
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
            selectionEntries: [{ id: 'gladius', name: 'Gladius Task Force', type: 'upgrade' }],
          },
        ],
      },
    ],
  })
  loaded.factionContents.set('test-catalogue', withCards('Test catalogue', []))
  const detail = {
    id: 'gladius',
    name: 'Gladius Task Force',
    points: 1,
    dispositions: [],
    rules: [{ name: 'Combat Doctrines', description: 'Card rule.' }],
    enhancements: [],
    upgrades: [],
    stratagems: [],
  }
  const rules = {
    attribution: 'Community data',
    factionKeys: new Map(),
    detachmentReferences: new Map(),
    detachmentDetails: new Map([['test-catalogue', new Map([['gladius-task-force', detail]])]]),
    dispositions: new Map(),
  } as Partial<LoadedRules> as LoadedRules

  expect(detachmentReference(loaded, rules, 'cat', 'gladius-task-force')?.rules).toEqual(detail.rules)
})
