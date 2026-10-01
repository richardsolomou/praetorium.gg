import { describe, expect, it } from 'vitest'
import { abilityNamesIn, datasheetIn, rulesReferencedIn } from './catalogue'
import { describeDatasheetAbilities, describeDatasheetAbilitiesWithContributions } from './datasheetDescriptions'
import { ability, bookOf, points, shelfOf } from './catalogue.fixtures'
import type { LoadedRules } from './rules'

describe('the abilities and wargear a datasheet lists', () => {
  it('resolves a faction ability linked to a rule declared at the catalogue root', () => {
    const book = bookOf({
      rules: [{ id: 'rally', name: 'Rally!', description: 'Friendly units can advance.' }],
      selectionEntries: [
        {
          id: 'trooper',
          name: 'Trooper',
          type: 'unit',
          infoLinks: [{ id: 'rally-link', name: 'Rally!', type: 'rule', targetId: 'rally' }],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'trooper')?.abilities).toContainEqual({
      id: 'rally-link',
      name: 'Rally!',
      kind: 'faction',
      description: 'Friendly units can advance.',
    })
  })

  it('separates faction, core, datasheet, rule and wargear abilities', () => {
    const book = bookOf({
      sharedProfiles: [ability('shared-ability', 'My Will Be Done')],
      sharedRules: [
        { id: 'faction-rule', name: 'Reanimation Protocols', description: 'Reanimate.' },
        { id: 'core-rule', name: 'Leader', description: 'Attach this model.' },
      ],
      sharedSelectionEntries: [{ id: 'orb', name: 'Orb', type: 'upgrade', profiles: [ability('orb-ability', 'Resurrection Orb')] }],
      selectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          profiles: [ability('own-ability', 'Translocation Shroud')],
          infoLinks: [
            { id: 'faction-link', targetId: 'faction-rule', name: 'Reanimation Protocols', type: 'rule' },
            { id: 'shared-link', targetId: 'shared-ability', name: 'My Will Be Done', type: 'profile' },
          ],
          infoGroups: [
            {
              id: 'leader-group',
              name: 'Leader',
              profiles: [ability('leader-ability', 'Leader')],
              infoLinks: [{ id: 'core-link', targetId: 'core-rule', name: 'Leader', type: 'rule' }],
            },
          ],
          entryLinks: [{ id: 'orb-link', targetId: 'orb', name: 'Orb', type: 'selectionEntry' }],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'lord')?.abilities.map(({ name, kind }) => [name, kind])).toEqual([
      ['Translocation Shroud', 'datasheet'],
      ['Leader', 'rule'],
      ['Leader', 'core'],
      ['Reanimation Protocols', 'faction'],
      ['My Will Be Done', 'datasheet'],
      ['Resurrection Orb', 'wargear'],
    ])
    expect(abilityNamesIn(book, 'cat', 'lord')).toEqual([
      'Translocation Shroud',
      'Leader',
      'Reanimation Protocols',
      'My Will Be Done',
      'Resurrection Orb',
    ])
    const described = describeDatasheetAbilitiesWithContributions(book, 'cat', datasheetIn(book, 'cat', 'lord'), null, {
      reference: true,
    })
    expect(described?.datasheet.abilities).toContainEqual(expect.objectContaining({ name: 'Resurrection Orb', kind: 'wargear' }))
    expect(described?.contributions).toEqual({ datacards: false, rules: false })
    expect(datasheetIn(book, 'cat', 'lord', { selections: [{ id: 'lord' }], unitSelectionIndex: 0 })?.abilities).not.toContainEqual(
      expect.objectContaining({ name: 'Resurrection Orb' }),
    )
    expect(
      datasheetIn(book, 'cat', 'lord', {
        selections: [{ id: 'lord', selections: [{ id: 'orb-link' }] }],
        unitSelectionIndex: 0,
      })?.abilities,
    ).toContainEqual(expect.objectContaining({ name: 'Resurrection Orb', kind: 'wargear' }))
  })

  it('uses current card abilities for a chapter importing the replaced Marine book', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'jump-packs',
          name: 'Assault Intercessors with Jump Packs',
          type: 'unit',
          profiles: [ability('old-hammer', 'Old Hammer of Wrath')],
        },
      ],
    })
    book.profiledSupplementIds.add('cat')
    book.factionContents.set('test-catalogue', {
      name: 'Test catalogue',
      datasheets: new Set(['Assault Intercessors with Jump Packs']),
      datasheetDetails: new Map([
        [
          'Assault Intercessors with Jump Packs',
          {
            abilities: [{ name: 'Hammer of Wrath', description: 'Current charge rule.' }],
            composition: [],
            loadout: null,
            wargear: [],
            baseSize: null,
            transport: null,
            points: [],
            attachesTo: [],
            leaders: [],
            supporters: [],
          },
        ],
      ]),
      datasheetIds: new Map(),
      detachments: new Set(),
      enhancements: new Map(),
      stratagems: new Map(),
      stratagemIssues: [],
      detachmentRules: new Map(),
      armyRules: [],
      factionAbilityNames: new Set(),
    })

    const sheet = datasheetIn(book, 'cat', 'jump-packs')
    expect(sheet?.abilities.map(({ name, description }) => [name, description])).toEqual([['Hammer of Wrath', 'Current charge rule.']])
    expect(describeDatasheetAbilitiesWithContributions(book, 'cat', sheet, null)?.contributions.datacards).toBe(true)
  })

  it('prefers matching new Marine BSData profiles and abilities in chapter rosters', () => {
    const unit = (id: string, toughness: string, healing: string) => ({
      id,
      name: 'Apothecary',
      type: 'model' as const,
      profiles: [
        {
          id: `${id}-stats`,
          name: id === 'old-apothecary' ? 'Primaris Apothecary' : 'Apothecary',
          typeName: 'Unit',
          characteristics: [{ name: 'T', $text: toughness }],
        },
        {
          id: `${id}-healing`,
          name: 'Narthecium',
          typeName: 'Abilities',
          characteristics: [{ name: 'Description', $text: healing }],
        },
        ...(id === 'new-apothecary'
          ? [
              {
                id: 'new-notes',
                name: 'Datasheet Notes',
                typeName: 'Abilities',
                characteristics: [{ name: 'Description', $text: 'This model is equipped with a weapon.' }],
              },
              {
                id: 'new-last-stand',
                name: 'Last Stand',
                typeName: 'Abilities',
                characteristics: [{ name: 'Description', $text: 'This unit fights again.' }],
              },
            ]
          : []),
      ],
    })
    const book = shelfOf(
      { name: 'Space Marines', selectionEntries: [unit('old-apothecary', '5', 'Return a destroyed model.')] },
      { name: 'Space Marines (11e)', selectionEntries: [unit('new-apothecary', '4', 'This unit heals D3+1 wounds.')] },
      { name: 'Dark Angels', catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
    )
    book.profiledSupplementIds.add('cat-2')
    book.replacements = new Map([['cat', 'cat-1']])
    book.factionContents.set('dark-angels', {
      name: 'Dark Angels',
      datasheets: new Set(['Apothecary']),
      datasheetDetails: new Map([
        [
          'Apothecary',
          {
            profiles: [{ name: 'Apothecary', type: 'Unit', values: { T: '6' } }],
            abilities: [
              { name: 'Narthecium', description: 'This unit heals D3 wounds.' },
              { name: 'Last Stand (Once per battle, per unit)', description: 'This unit shoots again.' },
              { name: 'Combat Revival', description: 'Return a model.' },
            ],
            composition: [],
            loadout: null,
            wargear: [],
            baseSize: null,
            transport: null,
            points: [],
            attachesTo: [],
            leaders: [],
            supporters: [],
          },
        ],
      ]),
      datasheetIds: new Map(),
      detachments: new Set(),
      enhancements: new Map(),
      stratagems: new Map(),
      stratagemIssues: [],
      detachmentRules: new Map(),
      armyRules: [],
      factionAbilityNames: new Set(),
    })

    const sheet = datasheetIn(book, 'cat-2', 'old-apothecary')
    expect(sheet?.profiles.find((profile) => profile.type === 'Unit')?.values).toContainEqual({ name: 'T', value: '4' })
    expect(sheet?.abilities.map(({ name, description }) => [name, description])).toEqual([
      ['Narthecium', 'This unit heals D3+1 wounds.'],
      ['Last Stand (Once per battle, per unit)', 'This unit fights again.'],
      ['Combat Revival', 'Return a model.'],
    ])
  })

  it('uses the one renamed model profile when the other model name still matches', () => {
    const squad = (id: string, marine: string, toughness: string) => ({
      id,
      name: 'Jump Squad',
      type: 'unit' as const,
      profiles: [
        {
          id: `${id}-sergeant`,
          name: 'Jump Sergeant',
          typeName: 'Unit',
          characteristics: [{ name: 'T', $text: '5' }],
        },
        {
          id: `${id}-marine`,
          name: marine,
          typeName: 'Unit',
          characteristics: [{ name: 'T', $text: toughness }],
        },
      ],
    })
    const book = shelfOf(
      { selectionEntries: [squad('old-squad', 'Jump Marines', '4')] },
      { selectionEntries: [squad('new-squad', 'Jump Marine', '5')] },
      { catalogueLinks: [{ targetId: 'cat', importRootEntries: true }] },
    )
    book.profiledSupplementIds.add('cat-2')
    book.replacements = new Map([['cat', 'cat-1']])

    expect(datasheetIn(book, 'cat-2', 'old-squad')?.profiles.find((profile) => profile.name === 'Jump Marines')?.values).toContainEqual({
      name: 'T',
      value: '5',
    })
  })

  it.each([
    {
      catalogueName: 'Imperium - Adeptus Astartes - Black Templars',
      factionSlug: 'black-templars',
      rulesFaction: 'black-templars',
      expected: 'Templar Vows',
    },
    {
      catalogueName: 'Imperium - Adeptus Astartes - Space Marines',
      factionSlug: 'space-marines',
      rulesFaction: 'adeptus-astartes',
      expected: 'Oath of Moment',
    },
  ])('shows only $expected for $catalogueName', ({ catalogueName, factionSlug, rulesFaction, expected }) => {
    const book = bookOf({
      name: catalogueName,
      sharedRules: [
        { id: 'oath', name: 'Oath of Moment', description: 'Mark a target.' },
        { id: 'vows', name: 'Templar Vows', description: 'Select a vow.' },
      ],
      selectionEntries: [
        {
          id: 'judiciar',
          name: 'Judiciar',
          type: 'model',
          infoLinks: [
            { id: 'oath-link', targetId: 'oath', name: 'Oath of Moment', type: 'rule' },
            { id: 'vows-link', targetId: 'vows', name: 'Templar Vows', type: 'rule' },
          ],
        },
      ],
    })
    book.factionContents.set(rulesFaction, {
      name: rulesFaction,
      datasheets: new Set(),
      datasheetDetails: new Map(),
      datasheetIds: new Map(),
      detachments: new Set(),
      enhancements: new Map(),
      stratagems: new Map(),
      stratagemIssues: [],
      detachmentRules: new Map(),
      armyRules: [{ name: expected, description: 'Army rule.' }],
      factionAbilityNames: new Set(),
    })
    const rules = {
      abilityDescriptions: new Map(),
      detachmentDetails: new Map(),
      factionKeys: new Map([[factionSlug, rulesFaction]]),
    } as Partial<LoadedRules> as LoadedRules

    const described = describeDatasheetAbilitiesWithContributions(book, 'cat', datasheetIn(book, 'cat', 'judiciar'), rules)
    expect(described?.datasheet.abilities.map(({ name }) => name)).toEqual([expected])
    expect(described?.contributions.datacards).toBe(true)
  })

  it('replaces the old parent rule while preserving a chapter ability on its datasheet', () => {
    const detachment = (id: string, name: string) => ({ id, name, type: 'upgrade' as const })
    const wrapper = (id: string, option: ReturnType<typeof detachment>) => ({
      id: `${id}-wrapper`,
      name: 'Detachment',
      type: 'upgrade' as const,
      selectionEntryGroups: [{ id: `${id}-choices`, name: 'Detachment', selectionEntries: [option] }],
    })
    const book = shelfOf(
      {
        name: 'Dark Angels',
        sharedRules: [
          { id: 'oath', name: 'Oath of Moment', description: 'Mark a target.' },
          { id: 'chapter', name: 'Transhuman Strategist', description: 'Chapter tactics.' },
        ],
        selectionEntries: [
          {
            id: 'apothecary',
            name: 'Apothecary',
            type: 'model',
            infoLinks: [
              { id: 'oath-link', targetId: 'oath', name: 'Oath of Moment', type: 'rule' },
              { id: 'chapter-link', targetId: 'chapter', name: 'Transhuman Strategist', type: 'rule' },
            ],
          },
        ],
        sharedSelectionEntries: [wrapper('current', detachment('wrath', 'Wrath of the Rock'))],
      },
      {
        name: 'Space Marines',
        selectionEntries: [{ id: 'intercessors', name: 'Intercessors', type: 'unit' }],
        sharedSelectionEntries: [wrapper('parent', detachment('assault', 'Assault Brethren'))],
      },
    )
    const inherited = book.detachments.get('cat-1')!.options[0]!
    book.detachments.get('cat')!.options.push(inherited)
    book.profiledDetachmentIds.add('assault')
    book.profiledArmyRules.set('cat-1', [{ name: 'Combat Doctrines', description: 'Select a doctrine.' }])
    book.factionContents.set('dark-angels', {
      name: 'Dark Angels',
      datasheets: new Set(),
      datasheetDetails: new Map(),
      datasheetIds: new Map(),
      detachments: new Set(),
      enhancements: new Map(),
      stratagems: new Map(),
      stratagemIssues: [],
      detachmentRules: new Map(),
      armyRules: [
        { name: 'Combat Doctrines', description: 'Select a doctrine.' },
        { name: 'Transhuman Strategist', description: 'Chapter tactics.' },
      ],
      factionAbilityNames: new Set(['Combat Doctrines', 'Transhuman Strategist']),
    })

    expect(describeDatasheetAbilities(book, 'cat', datasheetIn(book, 'cat', 'apothecary'), null)?.abilities).toEqual([
      {
        id: 'chapter-link',
        name: 'Transhuman Strategist',
        description: 'Chapter tactics.',
        kind: 'faction',
      },
      {
        id: 'profile-army-rule:combat-doctrines',
        name: 'Combat Doctrines',
        description: 'Select a doctrine.',
        kind: 'faction',
      },
    ])
  })

  it('shows a unit enhancement ability only when the enhancement is selected', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          profiles: [ability('intrinsic', 'Implacable Eradication')],
          selectionEntryGroups: [
            {
              id: 'enhancements',
              name: 'Enhancements',
              selectionEntries: [
                { id: 'tools', name: 'Tools of Dominion', type: 'upgrade', profiles: [ability('tools-ability', 'Tools of Dominion')] },
              ],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'immortals')?.abilities.map(({ name }) => name)).toEqual(['Implacable Eradication'])
    expect(abilityNamesIn(book, 'cat', 'immortals')).toEqual(['Implacable Eradication'])
    expect(
      datasheetIn(book, 'cat', 'immortals', {
        selections: [{ id: 'immortals', selections: [{ id: 'enhancements', selections: [{ id: 'tools' }] }] }],
        unitSelectionIndex: 0,
      })?.abilities.map(({ name }) => name),
    ).toEqual(['Implacable Eradication', 'Tools of Dominion'])
  })

  it('shows a hidden detachment enhancement on the datasheet only once it is taken', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'nightbringer',
          name: 'Nightbringer',
          type: 'unit',
          profiles: [ability('intrinsic', 'Necrodermis')],
          selectionEntries: [
            {
              id: 'goad',
              name: 'Quantum Goad',
              type: 'upgrade',
              hidden: true,
              costs: points(45),
              profiles: [ability('goad-ability', 'Quantum Goad')],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'nightbringer')?.abilities.map(({ name }) => name)).toEqual(['Necrodermis'])
    expect(
      datasheetIn(book, 'cat', 'nightbringer', {
        selections: [{ id: 'nightbringer', selections: [{ id: 'goad' }] }],
        unitSelectionIndex: 0,
      })?.abilities.map(({ name }) => name),
    ).toEqual(['Necrodermis', 'Quantum Goad'])
  })

  it('shows a detachment ability only when its detachment is selected', () => {
    const book = bookOf({
      sharedProfiles: [
        {
          ...ability('distortion-fields', 'Distortion Fields (Aura)'),
          modifiers: [
            {
              type: 'set',
              field: 'hidden',
              value: true,
              conditions: [
                {
                  type: 'lessThan',
                  value: 1,
                  field: 'selections',
                  scope: 'force',
                  childId: 'pantheon',
                  includeChildSelections: true,
                },
              ],
            },
          ],
        },
      ],
      sharedSelectionEntries: [
        {
          id: 'orb',
          name: 'Resurrection Orb',
          type: 'upgrade',
          profiles: [ability('orb-ability', 'Resurrection Orb')],
        },
        {
          id: 'detachment',
          name: 'Detachment',
          type: 'upgrade',
          selectionEntryGroups: [
            {
              id: 'detachments',
              name: 'Detachment',
              selectionEntries: [
                { id: 'hypercrypt', name: 'Hypercrypt Legion', type: 'upgrade' },
                { id: 'pantheon', name: 'Pantheon of Woe', type: 'upgrade' },
              ],
            },
          ],
        },
      ],
      selectionEntries: [
        {
          id: 'nightbringer',
          name: 'Nightbringer',
          type: 'unit',
          infoLinks: [{ id: 'distortion-fields-link', targetId: 'distortion-fields', type: 'profile' }],
          entryLinks: [{ id: 'orb-link', targetId: 'orb', name: 'Resurrection Orb', type: 'selectionEntry' }],
        },
      ],
    })
    const abilityNames = (detachmentId: string) =>
      datasheetIn(book, 'cat', 'nightbringer', {
        selections: [{ id: detachmentId }, { id: 'nightbringer' }],
        unitSelectionIndex: 1,
      })?.abilities.map(({ name }) => name)

    expect(abilityNames('hypercrypt')).toEqual([])
    expect(abilityNames('pantheon')).toEqual(['Distortion Fields (Aura)'])
    const reference = describeDatasheetAbilities(book, 'cat', datasheetIn(book, 'cat', 'nightbringer'), null, { reference: true })
    expect(reference?.abilities.map(({ name }) => name)).toEqual(['Resurrection Orb'])
    expect(reference?.detachments.map(({ name, abilities }) => [name, abilities.map((entry) => entry.name)])).toEqual([
      ['Pantheon of Woe', ['Distortion Fields (Aura)']],
    ])
  })

  it('identifies a selected detachment unit upgrade separately from wargear', () => {
    const book = bookOf({
      sharedSelectionEntries: [
        {
          id: 'upgrade',
          name: 'Death in the Dark',
          type: 'upgrade',
          profiles: [ability('upgrade-ability', 'Death in the Dark')],
        },
      ],
      selectionEntries: [
        {
          id: 'incursors',
          name: 'Incursor Squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'enhancements',
              name: 'Subversion Assets Enhancements',
              entryLinks: [{ id: 'selected-upgrade', name: 'Death in the Dark', type: 'selectionEntry', targetId: 'upgrade' }],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'incursors', selections: [{ id: 'enhancements', selections: [{ id: 'selected-upgrade' }] }] }]
    const rules = {
      abilityDescriptions: new Map(),
      factionKeys: new Map(),
      detachmentDetails: new Map([
        [
          'test-catalogue',
          new Map([
            [
              'subversion-assets',
              {
                id: 'subversion-assets',
                name: 'Subversion Assets',
                points: null,
                dispositions: [],
                rules: [],
                enhancements: [],
                upgrades: [{ name: 'Death in the Dark', points: 15, description: 'Strike from concealment.' }],
                stratagems: [],
              },
            ],
          ]),
        ],
      ]),
    } as Partial<LoadedRules> as LoadedRules
    const sheet = datasheetIn(book, 'cat', 'incursors', { selections, unitSelectionIndex: 0 })

    expect(datasheetIn(book, 'cat', 'incursors', { selections: [{ id: 'incursors' }], unitSelectionIndex: 0 })?.abilities).toEqual([])
    const described = describeDatasheetAbilitiesWithContributions(book, 'cat', sheet, rules)
    expect(described?.datasheet.abilities).toContainEqual(expect.objectContaining({ name: 'Death in the Dark', kind: 'upgrade' }))
    expect(described?.contributions.rules).toBe(true)
  })

  it('does not offer an enhancement when its eligibility semantics are unavailable', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'character', name: 'Character' }],
      selectionEntries: [
        { id: 'captain', name: 'Captain', type: 'unit', categoryLinks: [{ id: 'character-link', targetId: 'character', primary: true }] },
      ],
    })
    const rules = {
      abilityDescriptions: new Map(),
      factionKeys: new Map(),
      detachmentDetails: new Map([
        [
          'test-catalogue',
          new Map([
            [
              'detachment',
              {
                id: 'detachment',
                name: 'Detachment',
                points: 1,
                dispositions: ['disruption'],
                rules: [],
                enhancements: [
                  { name: 'Known', points: 10, description: 'Known.', keywordRestrictions: [] },
                  { name: 'Unknown', points: 10, description: 'Unknown.', keywordRestrictions: null },
                ],
                upgrades: [],
                stratagems: [],
              },
            ],
          ]),
        ],
      ]),
    } as Partial<LoadedRules> as LoadedRules

    expect(
      describeDatasheetAbilities(book, 'cat', datasheetIn(book, 'cat', 'captain'), rules)?.detachments[0]?.enhancements.map(
        ({ name }) => name,
      ),
    ).toEqual(['Known'])
  })

  it('classifies game-system rules linked by a datasheet as core abilities', () => {
    const loaded = shelfOf({
      sharedRules: [{ id: 'faction-rule', name: 'Faction rule', description: 'Faction text.' }],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          infoLinks: [
            { id: 'core-link', targetId: 'core-rule', name: 'Core rule', type: 'rule' },
            { id: 'faction-link', targetId: 'faction-rule', name: 'Faction rule', type: 'rule' },
          ],
        },
      ],
    })
    loaded.index.rules.set('core-rule', { id: 'core-rule', name: 'Core rule', description: 'Core text.' })
    loaded.index.ruleCatalogueOf.set('core-rule', 'gs')

    expect(datasheetIn(loaded, 'cat', 'unit')?.abilities.map(({ name, kind }) => [name, kind])).toEqual([
      ['Core rule', 'core'],
      ['Faction rule', 'faction'],
    ])
  })

  it('hides core abilities that require an attachment when no attachment is present', () => {
    const loaded = shelfOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          infoLinks: [
            {
              id: 'conditional-link',
              targetId: 'core-rule',
              name: 'Conditional rule',
              type: 'rule',
              modifiers: [
                {
                  type: 'set',
                  field: 'hidden',
                  value: true,
                  conditions: [{ type: 'lessThan', field: 'associations', scope: 'self', childId: 'leader', value: 1 }],
                },
              ],
            },
          ],
        },
      ],
    })
    loaded.index.rules.set('core-rule', { id: 'core-rule', name: 'Conditional rule', description: 'Conditional text.' })
    loaded.index.ruleCatalogueOf.set('core-rule', 'gs')

    expect(datasheetIn(loaded, 'cat', 'unit')?.abilities).toEqual([])
    expect(abilityNamesIn(loaded, 'cat', 'unit')).toEqual([])
  })

  it('lists the choices available on a datasheet as wargear options', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'weapons',
              name: 'Weapons',
              constraints: [{ id: 'weapons-max', type: 'max', scope: 'parent', field: 'selections', value: 1 }],
              selectionEntries: [
                { id: 'rifle', name: 'Rifle', type: 'upgrade' },
                { id: 'pistol', name: 'Pistol', type: 'upgrade' },
              ],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'unit')?.wargearOptions).toEqual(['**Weapons:** Rifle; Pistol.'])
  })

  it('applies values appended to core rule names', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'feel-no-pain', name: 'Feel No Pain', description: 'Ignore wounds.' },
        { id: 'deadly-demise', name: 'Deadly Demise', description: 'Explode.' },
      ],
      selectionEntries: [
        {
          id: 'ctan',
          name: "C'tan Shard",
          type: 'model',
          infoLinks: [
            {
              id: 'feel-no-pain-link',
              targetId: 'feel-no-pain',
              name: 'Feel No Pain',
              type: 'rule',
              modifiers: [{ type: 'append', field: 'name', value: '5+' }],
            },
            {
              id: 'deadly-demise-link',
              targetId: 'deadly-demise',
              name: 'Deadly Demise',
              type: 'rule',
              modifiers: [{ type: 'append', field: 'name', value: 'D6' }],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'ctan')?.abilities.map((rule) => rule.name)).toEqual(['Feel No Pain 5+', 'Deadly Demise D6'])
  })

  it('keeps an upgrade name when its embedded ability has a different title', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'deceiver',
          name: "C'tan Shard of the Deceiver",
          type: 'model',
          selectionEntries: [
            {
              id: 'matrix',
              name: 'Singularity Matrix',
              type: 'upgrade',
              profiles: [ability('deceit', 'Lord of Deceit (Aura)')],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'deceiver')?.abilities[0]).toMatchObject({
      name: 'Lord of Deceit (Aura)',
      source: 'Singularity Matrix',
    })
  })

  it('keeps definitions for linked weapon keywords', () => {
    const book = bookOf({
      sharedRules: [{ id: 'devastating', name: 'Devastating Wounds', description: 'Critical wounds inflict mortal wounds.' }],
      sharedSelectionEntries: [
        {
          id: 'blade',
          name: 'Blade',
          type: 'upgrade',
          infoLinks: [{ id: 'devastating-link', targetId: 'devastating', name: 'Devastating Wounds', type: 'rule' }],
          profiles: [
            {
              id: 'blade-profile',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'Keywords', $text: 'Devastating Wounds' }],
            },
          ],
        },
      ],
      selectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          entryLinks: [{ id: 'blade-link', targetId: 'blade', name: 'Blade', type: 'selectionEntry' }],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'lord')?.keywordRules).toEqual([
      { name: 'Devastating Wounds', description: 'Critical wounds inflict mortal wounds.' },
    ])
  })

  it('finds rule definitions referenced by catalogue formatting', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'feel-no-pain', name: 'Feel No Pain', description: 'Ignore lost wounds.' },
        { id: 'lethal-hits', name: 'Lethal Hits', description: 'Critical hits wound automatically.' },
      ],
    })
    expect(rulesReferencedIn(book, ['This model has **Feel No Pain 4+**, [LETHAL HITS] and ^^**VEHICLE^^**.'])).toEqual([
      { name: 'Feel No Pain', description: 'Ignore lost wounds.' },
      { name: 'Lethal Hits', description: 'Critical hits wound automatically.' },
    ])
  })

  /**
   * A keyword a detachment upgrade appends to a weapon arrives as a bare word: the
   * entry that printed the profile links the rules it was printed with, and nothing
   * links the one that was added. Without looking it up by name, [ASSAULT] on a
   * modified profile is the only keyword on screen a player cannot read.
   */
  it('describes a weapon keyword an upgrade added rather than the datasheet printed', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'assault', name: 'Assault', description: 'Can be shot with after Advancing.' },
        { id: 'lethal', name: 'Lethal Hits', description: 'Critical hits wound automatically.' },
      ],
      selectionEntries: [
        {
          id: 'destroyers',
          name: 'Destroyers',
          type: 'unit',
          profiles: [
            {
              id: 'cannon',
              name: 'Gauss cannon',
              typeName: 'Ranged Weapons',
              characteristics: [{ name: 'Keywords', typeId: 'keywords', $text: 'Lethal Hits' }],
            },
          ],
          selectionEntryGroups: [
            {
              id: 'upgrades',
              name: 'Enhancements',
              selectionEntries: [
                {
                  id: 'madness',
                  name: 'Deepening Madness',
                  type: 'upgrade',
                  modifiers: [
                    {
                      type: 'append' as const,
                      value: 'Assault',
                      field: 'keywords',
                      join: ', ',
                      scope: 'parent',
                      affects: 'self.entries.group.recursive.profiles.Ranged Weapons',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'destroyers', selections: [{ id: 'upgrades', selections: [{ id: 'madness' }] }] }]
    const sheet = datasheetIn(book, 'cat', 'destroyers', { selections, unitSelectionIndex: 0 })

    expect(sheet?.profiles[0]?.values).toEqual([
      { name: 'Keywords', value: 'Lethal Hits, Assault', baseValue: 'Lethal Hits', modifiers: ['Deepening Madness'] },
    ])
    // The datasheet itself links neither rule, so both are found by name.
    expect(sheet?.keywordRules).toEqual([])
    expect(describeDatasheetAbilities(book, 'cat', sheet, null)?.keywordRules).toEqual([
      { name: 'Assault', description: 'Can be shot with after Advancing.' },
      { name: 'Lethal Hits', description: 'Critical hits wound automatically.' },
    ])
  })
})
