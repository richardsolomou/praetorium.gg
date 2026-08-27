import { describe, expect, it } from 'vitest'
import { contextualAbilityNamesIn, datasheetIn } from './catalogue'
import { bookOf, profileOperationCases } from './catalogue.fixtures'
import { describeDatasheetAbilities } from './datasheetDescriptions'

describe('the profile modifiers on a datasheet', () => {
  it('applies profile modifiers from the selected detachment and preserves their source', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'cursed-legion', name: 'Cursed Legion', type: 'upgrade' },
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          profiles: [
            { id: 'immortal-blaster', name: 'Gauss blaster', typeName: 'Ranged Weapons', characteristics: [{ name: 'S', $text: '5' }] },
          ],
        },
      ],
      entryLinks: [{ id: 'destroyers', name: 'Destroyers', targetId: 'destroyer-sheet', type: 'selectionEntry' }],
      sharedSelectionEntries: [
        {
          id: 'destroyer-sheet',
          name: 'Destroyers',
          type: 'unit',
          selectionEntries: [
            {
              id: 'blade-entry',
              name: 'Blade',
              type: 'upgrade',
              profiles: [
                {
                  id: 'blade',
                  name: 'Blade',
                  typeName: 'Melee Weapons',
                  characteristics: [{ name: 'S', typeId: 'melee-strength', $text: '5' }],
                },
              ],
            },
            {
              id: 'claw-entry',
              name: 'Claw',
              type: 'upgrade',
              profiles: [
                {
                  id: 'claw',
                  name: 'Claw',
                  typeName: 'Melee Weapons',
                  characteristics: [{ name: 'S', typeId: 'melee-strength', $text: '4' }],
                },
              ],
            },
          ],
          modifierGroups: [
            {
              conditions: [
                {
                  type: 'atLeast',
                  value: 1,
                  field: 'selections',
                  scope: 'force',
                  childId: 'cursed-legion',
                  includeChildSelections: true,
                },
              ],
              modifiers: [
                {
                  type: 'increment',
                  value: 2,
                  field: 'melee-strength',
                  scope: 'root-entry',
                  affects: 'self.entries.recursive.blade-entry.profiles.Melee Weapons',
                },
              ],
            },
          ],
        },
      ],
    })

    expect(
      datasheetIn(book, 'cat', 'destroyers', {
        selections: [{ id: 'cursed-legion' }, { id: 'destroyers' }],
      })?.profiles[0]?.values[0],
    ).toEqual({ name: 'S', value: '7', baseValue: '5', modifiers: ['Cursed Legion'] })
    expect(
      datasheetIn(book, 'cat', 'destroyers', {
        selections: [{ id: 'cursed-legion' }, { id: 'destroyers' }],
      })?.profiles[1]?.values[0],
    ).toEqual({ name: 'S', value: '4' })
    expect(datasheetIn(book, 'cat', 'destroyers')?.profiles[0]?.values[0]).toEqual({ name: 'S', value: '5' })
    expect(
      datasheetIn(book, 'cat', 'immortals', {
        selections: [{ id: 'cursed-legion' }, { id: 'destroyers' }, { id: 'immortals' }],
        unitSelectionIndex: 1,
      })?.profiles[0]?.values[0],
    ).toEqual({ name: 'S', value: '5' })
  })

  it('keeps an attached character weapon modifier on that character copy of a shared weapon', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'captain-category', name: 'Captain' }],
      sharedSelectionEntries: [
        {
          id: 'storm-bolter',
          name: 'Storm bolter',
          type: 'upgrade',
          profiles: [
            {
              id: 'storm-bolter-profile',
              name: 'Storm bolter',
              typeName: 'Ranged Weapons',
              characteristics: [{ name: 'BS', typeId: 'ballistic-skill', $text: '3+' }],
              modifiers: [
                {
                  type: 'set',
                  field: 'ballistic-skill',
                  value: '2+',
                  conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'ancestor', childId: 'captain-category' }],
                },
              ],
            },
          ],
        },
      ],
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          categoryLinks: [{ id: 'captain-keyword', targetId: 'captain-category', name: 'Captain' }],
          entryLinks: [{ id: 'captain-bolter', name: 'Storm bolter', type: 'selectionEntry', targetId: 'storm-bolter' }],
        },
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          entryLinks: [{ id: 'squad-bolter', name: 'Storm bolter', type: 'selectionEntry', targetId: 'storm-bolter' }],
        },
      ],
    })
    const selections = [
      { id: 'captain', selections: [{ id: 'captain-bolter' }] },
      { id: 'squad', selections: [{ id: 'squad-bolter' }] },
    ]
    const ballisticSkill = (entryId: string, unitSelectionIndex: number, companions: number[]) =>
      datasheetIn(book, 'cat', entryId, { selections, unitSelectionIndex, companions })?.profiles[0]?.values[0]?.value

    expect({ captain: ballisticSkill('captain', 0, [1]), squad: ballisticSkill('squad', 1, [0]) }).toEqual({
      captain: '2+',
      squad: '3+',
    })
  })

  it.each(profileOperationCases)(
    'applies the $type profile operation',
    ({ type, base, value, expected, position, join, arg, repeated, skipIfPresent }) => {
      const book = bookOf({
        selectionEntries: [
          {
            id: 'unit',
            name: 'Unit',
            type: 'unit',
            profiles: [
              { id: 'profile', name: 'Profile', typeName: 'Unit', characteristics: [{ name: 'M', typeId: 'field', $text: base }] },
            ],
            selectionEntries: [{ id: 'body', name: 'Body', type: 'model' }],
            modifiers: [
              {
                type,
                field: 'field',
                value,
                position,
                join,
                arg,
                skipIfPresent,
                affects: 'profiles.Unit',
                repeats: repeated ? [{ value: 1, field: 'selections', scope: 'self', childId: 'model' }] : undefined,
              },
            ],
          },
        ],
      })
      const sheet = datasheetIn(book, 'cat', 'unit', {
        selections: [{ id: 'unit', selections: [{ id: 'body', count: 2 }] }],
      })
      expect(sheet?.profiles[0]?.values[0]?.value).toBe(expected)
    },
  )

  it('applies profile name and annotation modifiers', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [{ id: 'profile', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '5' }] }],
          modifiers: [
            { type: 'append', field: 'name', value: 'Masterwork', join: ' — ', affects: 'profiles.Melee Weapons' },
            { type: 'append', field: 'annotation', value: 'Cold Fervour', join: ', ', affects: 'profiles.Melee Weapons' },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles[0]?.name).toBe('Blade — Masterwork (Cold Fervour)')
  })

  it('applies modifiers declared directly on a profile', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            {
              id: 'profile',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
              modifiers: [{ type: 'increment', field: 'strength', value: 2 }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles[0]?.values[0]?.value).toBe('7')
  })

  it('applies modifiers declared on a linked profile', () => {
    const book = bookOf({
      sharedProfiles: [
        {
          id: 'shared-profile',
          name: 'Blade',
          typeName: 'Melee Weapons',
          characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
        },
      ],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          infoLinks: [
            {
              id: 'profile-link',
              targetId: 'shared-profile',
              type: 'profile',
              modifiers: [{ type: 'increment', field: 'strength', value: 2 }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles[0]?.values[0]?.value).toBe('7')
  })

  it('applies profile visibility modifiers', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            {
              id: 'revealed',
              name: 'Revealed',
              typeName: 'Unit',
              hidden: true,
              characteristics: [{ name: 'M', $text: '5"' }],
              modifiers: [{ type: 'set', field: 'hidden', value: false }],
            },
            {
              id: 'concealed',
              name: 'Concealed',
              typeName: 'Unit',
              characteristics: [{ name: 'M', $text: '6"' }],
              modifiers: [{ type: 'set', field: 'hidden', value: true }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles.map(({ name }) => name)).toEqual(['Revealed'])
  })

  it('evaluates profile conditions against the complete roster', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            { id: 'profile', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }] },
          ],
          modifiers: [
            {
              type: 'increment',
              field: 'strength',
              value: 2,
              affects: 'self.entries.recursive.profiles.Melee Weapons',
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'support' }],
            },
          ],
        },
        { id: 'support', name: 'Support', type: 'unit' },
      ],
    })
    const value = (selections: { id: string }[]) => datasheetIn(book, 'cat', 'unit', { selections })?.profiles[0]?.values[0]?.value
    expect(value([{ id: 'unit' }, { id: 'support' }])).toBe('7')
    expect(value([{ id: 'unit' }])).toBe('5')
  })

  it('uses the selected copy when a roster contains duplicate datasheets', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            { id: 'profile', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }] },
          ],
          selectionEntries: [{ id: 'boost', name: 'Boost', type: 'upgrade' }],
          modifiers: [
            {
              type: 'increment',
              field: 'strength',
              value: 2,
              affects: 'self.entries.recursive.profiles.Melee Weapons',
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'self', childId: 'boost' }],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'unit', selections: [{ id: 'boost' }] }, { id: 'unit' }]
    expect(datasheetIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })?.profiles[0]?.values[0]?.value).toBe('7')
    expect(datasheetIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 1 })?.profiles[0]?.values[0]?.value).toBe('5')
  })

  it('keeps root-entry profile modifiers inside their selected unit', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'destroyer',
          name: 'Destroyer',
          type: 'unit',
          profiles: [
            {
              id: 'destroyer-blade',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
            },
          ],
          modifiers: [
            { type: 'increment', field: 'strength', value: 2, scope: 'root-entry', affects: 'self.entries.profiles.Melee Weapons' },
          ],
        },
        {
          id: 'immortals',
          name: 'Immortals',
          type: 'unit',
          profiles: [
            {
              id: 'immortals-blade',
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'strength', $text: '4' }],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'destroyer' }, { id: 'immortals' }]

    expect(datasheetIn(book, 'cat', 'destroyer', { selections, unitSelectionIndex: 0 })?.profiles[0]?.values[0]?.value).toBe('7')
    expect(datasheetIn(book, 'cat', 'immortals', { selections, unitSelectionIndex: 1 })?.profiles[0]?.values[0]?.value).toBe('4')
  })

  it('keeps an added characteristic inside the profile targeted by its modifier', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            {
              id: 'rifle',
              name: 'Rifle',
              typeName: 'Ranged Weapons',
              characteristics: [
                { name: 'S', typeId: 'strength', $text: '4' },
                { name: 'Keywords', typeId: 'keywords', $text: '' },
              ],
              modifiers: [{ type: 'append', field: 'keywords', value: 'Assault' }],
            },
            { id: 'pistol', name: 'Pistol', typeName: 'Ranged Weapons', characteristics: [{ name: 'S', typeId: 'strength', $text: '3' }] },
          ],
        },
      ],
    })
    book.characteristicNames = new Map([['keywords', 'Keywords']])

    const profiles = datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }] })?.profiles
    expect(profiles?.[0]?.values).toContainEqual({ name: 'Keywords', value: 'Assault', baseValue: '', modifiers: ['Unit'] })
    expect(profiles?.[1]?.values).toEqual([{ name: 'S', value: '3' }])
  })

  it('adds a leader ability keyword to the melee weapons in its attached unit', () => {
    const profiles = (id: string) => [
      {
        id: `${id}-blade`,
        name: 'Blade',
        typeName: 'Melee Weapons',
        characteristics: [
          { name: 'S', typeId: 'strength', $text: '5' },
          { name: 'Keywords', typeId: 'keywords', $text: '' },
        ],
      },
    ]
    const book = bookOf({
      selectionEntries: [
        {
          id: 'lord',
          name: 'Lord',
          type: 'model',
          profiles: profiles('lord'),
          selectionEntries: [
            {
              id: 'united-in-destruction',
              name: 'United in Destruction',
              type: 'upgrade',
              modifiers: [
                {
                  type: 'append',
                  value: 'Lethal Hits',
                  field: 'keywords',
                  scope: 'root-entry',
                  affects: 'entries.group.recursive.profiles.Melee Weapons',
                  join: ', ',
                  conditions: [{ type: 'atLeast', value: 1, field: 'associations', scope: 'self', childId: 'any' }],
                },
              ],
            },
          ],
        },
        { id: 'destroyers', name: 'Destroyers', type: 'unit', profiles: profiles('destroyers') },
      ],
    })
    book.characteristicNames = new Map([['keywords', 'Keywords']])
    const selections = [{ id: 'lord', selections: [{ id: 'united-in-destruction' }] }, { id: 'destroyers' }]
    const keywords = (entryId: string, unitSelectionIndex: number, companions: number[]) =>
      datasheetIn(book, 'cat', entryId, { selections, unitSelectionIndex, companions })?.profiles[0]?.values.find(
        (value) => value.name === 'Keywords',
      )

    expect(keywords('lord', 0, [1])).toMatchObject({ value: 'Lethal Hits', modifiers: ['United in Destruction'] })
    expect(keywords('destroyers', 1, [0])).toMatchObject({ value: 'Lethal Hits', modifiers: ['United in Destruction'] })
    expect(keywords('destroyers', 1, [])).toBeUndefined()
  })

  it('reads an attached-unit weapon ability when the catalogue only supplies its prose', () => {
    const weapon = (id: string, typeName: string) => ({
      id,
      name: 'Weapon',
      typeName,
      characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
    })
    const book = bookOf({
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          profiles: [
            weapon('captain-blade', 'Melee Weapons'),
            {
              id: 'tactical-instinct',
              name: 'Tactical Instinct',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text: 'While this model is leading a unit, weapons equipped by models in that unit have the [LETHAL HITS] ability.',
                },
              ],
            },
          ],
        },
        {
          id: 'veterans',
          name: 'Veterans',
          type: 'unit',
          profiles: [weapon('veteran-bolter', 'Ranged Weapons'), weapon('veteran-blade', 'Melee Weapons')],
        },
      ],
    })
    const selections = [{ id: 'captain' }, { id: 'veterans' }]
    const keywords = (entryId: string, unitSelectionIndex: number, companions: number[]) =>
      datasheetIn(book, 'cat', entryId, { selections, unitSelectionIndex, companions })?.profiles.flatMap((profile) =>
        profile.values.filter((value) => value.name === 'Keywords'),
      )

    expect(keywords('captain', 0, [1])).toEqual([
      { name: 'Keywords', value: 'Lethal Hits', baseValue: '', modifiers: ['Tactical Instinct'] },
    ])
    expect(keywords('veterans', 1, [0])).toEqual([
      { name: 'Keywords', value: 'Lethal Hits', baseValue: '', modifiers: ['Tactical Instinct'] },
      { name: 'Keywords', value: 'Lethal Hits', baseValue: '', modifiers: ['Tactical Instinct'] },
    ])
    expect(keywords('veterans', 1, [])).toEqual([])
  })

  it('shows abilities granted by enhancements and attached units as core abilities', () => {
    const grantedAbility = (id: string, name: string, description: string) => ({
      id,
      name,
      typeName: 'Abilities',
      characteristics: [{ name: 'Description', $text: description }],
    })
    const book = bookOf({
      sharedRules: [{ id: 'feel-no-pain', name: 'Feel No Pain', description: 'Roll when a model would lose a wound.' }],
      categoryEntries: [{ id: 'character', name: 'Character' }],
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          categoryLinks: [{ id: 'character-link', targetId: 'character', name: 'Character' }],
          profiles: [
            grantedAbility(
              'shadow-training',
              'Shadow Training',
              'While this model is leading a unit, models in that unit have the [STEALTH] ability.',
            ),
          ],
          selectionEntries: [
            {
              id: 'enduring-will',
              name: 'Enduring Will',
              type: 'upgrade',
              profiles: [grantedAbility('enduring-will-rule', 'Enduring Will', 'The bearer has the Feel No Pain 5+ ability.')],
            },
          ],
        },
        {
          id: 'veterans',
          name: 'Veterans',
          type: 'unit',
          profiles: [
            grantedAbility(
              'silent-bodyguard',
              'Silent Bodyguard',
              'While a ^^**Character^^** model is leading this unit, that ^^**Character^^** model has the Feel No Pain 4+ ability.',
            ),
          ],
        },
        {
          id: 'armoured-captain',
          name: 'Armoured Captain',
          type: 'model',
          selectionEntries: [
            {
              id: 'artificer-armour',
              name: 'Artificer Armour',
              type: 'upgrade',
              profiles: [
                grantedAbility(
                  'artificer-armour-rule',
                  'Artificer Armour',
                  '**^^Adeptus Astartes^^** model only. The bearer has a Save characteristic of 2+ and the Feel No Pain 6+ ability.',
                ),
              ],
              infoLinks: [
                {
                  id: 'artificer-feel-no-pain',
                  targetId: 'feel-no-pain',
                  name: 'Feel No Pain',
                  type: 'rule',
                  modifiers: [{ type: 'append', field: 'name', value: '5+', join: ' ' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const captain = { id: 'captain', selections: [{ id: 'enduring-will' }] }
    const selections = [captain, { id: 'veterans' }]

    const veterans = datasheetIn(book, 'cat', 'veterans', { selections, unitSelectionIndex: 1, companions: [0] })?.abilities
    expect(veterans).toContainEqual({
      id: 'granted:shadow-training',
      name: 'Stealth',
      source: 'Shadow Training',
      description: null,
      kind: 'core',
    })
    expect(veterans).not.toContainEqual(expect.objectContaining({ name: 'Feel No Pain 4+', kind: 'core' }))
    expect(datasheetIn(book, 'cat', 'captain', { selections: [captain], unitSelectionIndex: 0 })?.abilities).toContainEqual({
      id: 'granted:enduring-will-rule',
      name: 'Feel No Pain 5+',
      source: 'Enduring Will',
      description: null,
      kind: 'core',
    })
    expect(datasheetIn(book, 'cat', 'captain', { selections, unitSelectionIndex: 0, companions: [1] })?.abilities).toContainEqual({
      id: 'granted:silent-bodyguard',
      name: 'Feel No Pain 4+',
      source: 'Silent Bodyguard',
      description: null,
      kind: 'core',
    })
    expect(
      describeDatasheetAbilities(book, 'cat', datasheetIn(book, 'cat', 'captain', { selections: [captain], unitSelectionIndex: 0 }), null)
        ?.keywordRules,
    ).toContainEqual({ name: 'Feel No Pain', description: 'Roll when a model would lose a wound.' })
    expect(datasheetIn(book, 'cat', 'captain', { selections: [captain], unitSelectionIndex: 0 })?.abilities).not.toContainEqual(
      expect.objectContaining({ name: 'Stealth', kind: 'core' }),
    )
    expect(
      datasheetIn(book, 'cat', 'armoured-captain', {
        selections: [{ id: 'armoured-captain', selections: [{ id: 'artificer-armour' }] }],
        unitSelectionIndex: 0,
      })?.abilities,
    ).toContainEqual({
      id: 'granted:artificer-armour-rule',
      name: 'Feel No Pain 5+',
      source: 'Artificer Armour',
      description: null,
      kind: 'core',
    })
  })

  it('grants Stealth from a companion whose own unit has Stealth', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'chronomancer',
          name: 'Chronomancer',
          type: 'model',
          profiles: [
            {
              id: 'timesplinter-mantle',
              name: 'Timesplinter Mantle',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text: '- This unit has Stealth.\u00a0\n- Melee attacks that target this unit have -1 to hit rolls.',
                },
              ],
            },
          ],
        },
        { id: 'immortals', name: 'Immortals', type: 'unit' },
      ],
    })
    const selections = [{ id: 'chronomancer' }, { id: 'immortals' }]

    expect(datasheetIn(book, 'cat', 'immortals', { selections, unitSelectionIndex: 1, companions: [0] })?.abilities).toContainEqual({
      id: 'granted:timesplinter-mantle',
      name: 'Stealth',
      source: 'Timesplinter Mantle',
      description: null,
      kind: 'core',
    })
  })

  it('shows an ability granted to a unit by a selected upgrade', () => {
    const book = bookOf({
      sharedRules: [{ id: 'scouts-5', name: 'Scouts 5"', description: 'Make a Scout move of up to 5".' }],
      selectionEntries: [
        {
          id: 'warriors',
          name: 'Warriors',
          type: 'unit',
          selectionEntries: [
            {
              id: 'enlivened-sentinels',
              name: 'Enlivened Sentinels',
              type: 'upgrade',
              profiles: [
                {
                  id: 'enlivened-sentinels-rule',
                  name: 'Enlivened Sentinels',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'This unit has Scouts 5".' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'warriors', selections: [{ id: 'enlivened-sentinels' }] }]

    expect(datasheetIn(book, 'cat', 'warriors', { selections, unitSelectionIndex: 0 })?.abilities).toContainEqual({
      id: 'granted:enlivened-sentinels-rule',
      name: 'Scouts 5"',
      source: 'Enlivened Sentinels',
      description: null,
      kind: 'core',
    })
    expect(contextualAbilityNamesIn(book, 'cat', 'warriors', { selections, unitSelectionIndex: 0 })).toContain('Scouts 5"')
  })

  it.each([
    ['Deep Strike', 'This unit can be set up in Reserves.', 'Deep Strike'],
    ['Deep Strike', 'Models in this unit have the Deep Strike ability.', 'Deep Strike'],
    ['Deep Strike', 'If every model in this unit has the Deep Strike ability, it can be set up in Reserves.', 'Deep Strike'],
    [
      'Fated Emergence',
      'Models in this unit have the Deep Strike. If this unit has the Terminator keyword, you can target this unit with the Rapid Ingress Stratagem for 0CP.',
      'Deep Strike',
    ],
    ['Wraith of Ruin', 'Models in this unit have the Infiltrators ability.', 'Infiltrators'],
    [
      'Webway Pathstone',
      'Anhrathe unit only. Models in this unit have the Deep Strike ability. Each time this unit makes a Normal move, it can move through models and terrain features.',
      'Deep Strike',
    ],
    [
      'Terminator Armor',
      'Infantry model only. Change the bearer’s Save characteristic to 2+, add the Terminator keyword, it has a 4+ invulnerable save, it gains the Deep Strike ability, and replace its keywords.',
      'Deep Strike',
    ],
    ['Recon Drone', 'The bearer is equipped with 1 drone burst cannon and the bearer’s unit has the Infiltrators ability.', 'Infiltrators'],
    ['Cacophonic Accompaniment', '- This model has Deep Strike.\n- This unit’s ranged attacks have [IGNORES COVER].', 'Deep Strike'],
    ['Vanguard', 'This unit has Scouts 6″.', 'Scouts 6"'],
    ['Vanguard', 'This unit has Scouts 6”.', 'Scouts 6"'],
  ])('includes an optional deployment ability only when its upgrade is selected: %s', (profileName, description, ability) => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntries: [
            {
              id: 'teleporter',
              name: 'Teleporter',
              type: 'upgrade',
              profiles: [
                {
                  id: 'deep-strike',
                  name: profileName,
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: description }],
                },
              ],
            },
          ],
        },
      ],
    })
    const unselected = [{ id: 'unit' }]
    const selected = [{ id: 'unit', selections: [{ id: 'teleporter' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections: unselected, unitSelectionIndex: 0 })).not.toContain(ability)
    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections: selected, unitSelectionIndex: 0 })).toContain(ability)
  })

  it('applies attachment grants only for the named bodyguard unit', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'priest',
          name: 'Ministorum Priest',
          type: 'model',
          profiles: [
            {
              id: 'battlefield-blessing',
              name: 'Battlefield Blessing',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'If this model is attached to a Dominion Squad during the Declare Battle Formations step, it gains the Scouts 6" ability. If this model is attached to a Sisters Novitiate Squad during the Declare Battle Formations step, it gains the Infiltrators ability.',
                },
              ],
            },
          ],
        },
        { id: 'dominion', name: 'Dominion Squad', type: 'unit' },
        { id: 'novitiates', name: 'Sisters Novitiate Squad', type: 'unit' },
        { id: 'battle-sisters', name: 'Battle Sisters Squad', type: 'unit' },
      ],
    })
    const abilitiesWith = (bodyguard: { id: string }) => {
      const selections = [{ id: 'priest' }, bodyguard]
      return contextualAbilityNamesIn(book, 'cat', 'priest', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith({ id: 'dominion' })).toContain('Scouts 6"')
    expect(abilitiesWith({ id: 'dominion' })).not.toContain('Infiltrators')
    expect(abilitiesWith({ id: 'novitiates' })).toContain('Infiltrators')
    expect(abilitiesWith({ id: 'battle-sisters' })).not.toContain('Scouts 6"')
    expect(abilitiesWith({ id: 'battle-sisters' })).not.toContain('Infiltrators')
  })

  it('applies a model-has attachment grant to the named bodyguard unit', () => {
    const book = bookOf({
      sharedRules: [{ id: 'scouts-8', name: 'Scouts 8"', description: 'Make a Scout move of up to 8".' }],
      selectionEntries: [
        {
          id: 'leader',
          name: 'Technomancer',
          type: 'model',
          profiles: [
            {
              id: 'vanguard-protocols',
              name: 'Vanguard Protocols',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'If this model is attached to a Canoptek Macrocytes unit during the Declare Battle Formations step, this model has the Scouts 8" ability.',
                },
              ],
            },
          ],
          modifiers: [
            {
              type: 'add',
              field: 'add-info',
              value: 'scouts-8',
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'roster', childId: 'condition' }],
            },
          ],
        },
        { id: 'macrocytes', name: 'Canoptek Macrocytes', type: 'unit' },
        { id: 'warriors', name: 'Necron Warriors', type: 'unit' },
      ],
    })
    const abilitiesWith = (bodyguard: { id: string }) => {
      const selections = [{ id: 'leader' }, bodyguard]
      return contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith({ id: 'macrocytes' })).toContain('Scouts 8"')
    expect(abilitiesWith({ id: 'warriors' })).not.toContain('Scouts 8"')
  })

  it('matches an attachment grant against all bodyguard keyword classes', () => {
    const book = bookOf({
      categoryEntries: [
        { id: 'battleline', name: 'Battleline' },
        { id: 'emperors-children', name: "Faction: Emperor's Children" },
      ],
      selectionEntries: [
        {
          id: 'leader',
          name: 'Lord Exultant',
          type: 'model',
          profiles: [
            {
              id: 'lord-of-the-host',
              name: 'Lord of the Host',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'If this model is attached to an Emperor\'s Children Battleline unit during the Declare Battle Formations step, this model has the Infiltrators and Scouts 6" ability.',
                },
              ],
            },
          ],
        },
        {
          id: 'infractors',
          name: 'Infractors',
          type: 'unit',
          categoryLinks: [
            { id: 'infractors-battleline', targetId: 'battleline', name: 'Battleline' },
            { id: 'infractors-faction', targetId: 'emperors-children', name: "Faction: Emperor's Children" },
          ],
        },
        {
          id: 'other-battleline',
          name: 'Other Battleline',
          type: 'unit',
          categoryLinks: [{ id: 'other-battleline-link', targetId: 'battleline', name: 'Battleline' }],
        },
      ],
    })
    const abilitiesWith = (bodyguard: { id: string }) => {
      const selections = [{ id: 'leader' }, bodyguard]
      return contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith({ id: 'infractors' })).toEqual(expect.arrayContaining(['Infiltrators', 'Scouts 6"']))
    expect(abilitiesWith({ id: 'other-battleline' })).not.toContain('Infiltrators')
  })

  it('applies an attached bodyguard grant to its leader', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'character', name: 'Character' }],
      selectionEntries: [
        {
          id: 'leader',
          name: 'Watch Captain',
          type: 'model',
          categoryLinks: [{ id: 'leader-character', targetId: 'character', name: 'Character' }],
        },
        {
          id: 'bodyguard',
          name: 'Kill Team',
          type: 'unit',
          profiles: [
            {
              id: 'forward-deployment',
              name: 'Forward Deployment',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'If this unit has a Leader unit attached to it during the Declare Battle Formations step, that Leader unit gains the Infiltrators and Scouts 6" abilities.',
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'leader' }, { id: 'bodyguard' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0 })).not.toContain('Infiltrators')
    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })).toEqual(
      expect.arrayContaining(['Infiltrators', 'Scouts 6"']),
    )
  })

  it('does not infer an inverse attachment grant with another unmet condition', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'character', name: 'Character' }],
      selectionEntries: [
        {
          id: 'leader',
          name: 'Canoness',
          type: 'model',
          categoryLinks: [{ id: 'leader-character', targetId: 'character', name: 'Character' }],
        },
        {
          id: 'bodyguard',
          name: 'Dominion Squad',
          type: 'unit',
          profiles: [
            {
              id: 'holy-vanguard',
              name: 'Holy Vanguard',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'If this unit has a Leader unit attached to it during the Declare Battle Formations step and this unit starts the battle embarked within a Transport, that Leader unit gains the Scouts 6" ability.',
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'leader' }, { id: 'bodyguard' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })).not.toContain(
      'Scouts 6"',
    )
  })

  it('applies a bodyguard grant only to the named attached leader', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'character', name: 'Character' }],
      selectionEntries: [
        {
          id: 'priest',
          name: 'Ministorum Priest',
          type: 'model',
          categoryLinks: [{ id: 'priest-character', targetId: 'character', name: 'Character' }],
        },
        {
          id: 'canoness',
          name: 'Canoness',
          type: 'model',
          categoryLinks: [{ id: 'canoness-character', targetId: 'character', name: 'Character' }],
        },
        {
          id: 'sanctifiers',
          name: 'Sanctifiers',
          type: 'unit',
          profiles: [
            {
              id: 'holy-vanguard',
              name: 'Holy Vanguard',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'If a Ministorum Priest model from your army is attached to this unit during the Declare Battle Formations step, that model gains the Scouts 6" ability.',
                },
              ],
            },
          ],
        },
      ],
    })
    const abilitiesFor = (leaderId: string) => {
      const selections = [{ id: leaderId }, { id: 'sanctifiers' }]
      return contextualAbilityNamesIn(book, 'cat', leaderId, { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesFor('priest')).toContain('Scouts 6"')
    expect(abilitiesFor('canoness')).not.toContain('Scouts 6"')
  })

  it('applies a named leader grant to every model in its attached unit', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'character', name: 'Character' }],
      selectionEntries: [
        {
          id: 'techmarine',
          name: 'Brotherhood Techmarine',
          type: 'model',
          categoryLinks: [{ id: 'techmarine-character', targetId: 'character', name: 'Character' }],
        },
        {
          id: 'servitors',
          name: 'Servitors',
          type: 'unit',
          profiles: [
            {
              id: 'teleport-adepts',
              name: 'Teleport Adepts',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'While a Brotherhood Techmarine model is leading this unit, models in this unit have the Deep Strike and Teleport Assault abilities.',
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'techmarine' }, { id: 'servitors' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'techmarine', { selections, unitSelectionIndex: 0, companions: [1] })).toContain(
      'Deep Strike',
    )
    expect(contextualAbilityNamesIn(book, 'cat', 'servitors', { selections, unitSelectionIndex: 1, companions: [0] })).toContain(
      'Deep Strike',
    )
  })

  it('applies the grant for the bodyguard unit this model is leading', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'leader',
          name: 'Karandras',
          type: 'model',
          profiles: [
            {
              id: 'shadowmaster',
              name: 'Shadowmaster',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'While this model is leading a Howling Banshees unit, it has the Fights First ability. While this model is leading a Striking Scorpions unit, it has the Infiltrators, Scouts 7" and Stealth abilities.',
                },
              ],
            },
          ],
        },
        { id: 'banshees', name: 'Howling Banshees', type: 'unit' },
        { id: 'scorpions', name: 'Striking Scorpions', type: 'unit' },
      ],
    })
    const abilitiesWith = (bodyguardId: string) => {
      const selections = [{ id: 'leader' }, { id: bodyguardId }]
      return contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith('scorpions')).toEqual(expect.arrayContaining(['Infiltrators', 'Scouts 7"', 'Stealth']))
    expect(abilitiesWith('scorpions')).not.toContain('Fights First')
    expect(abilitiesWith('banshees')).toContain('Fights First')
  })

  it('includes each static linked ability only while its enhancement is selected', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'lone-operative', name: 'Lone Operative', description: 'Lone Operative rule.' },
        { id: 'stealth', name: 'Stealth', description: 'Stealth rule.' },
      ],
      selectionEntries: [
        {
          id: 'leader',
          name: 'Phobos Captain',
          type: 'model',
          selectionEntries: [
            {
              id: 'shroud-field',
              name: 'Shroud Field',
              type: 'upgrade',
              infoLinks: [
                { id: 'lone-operative-link', targetId: 'lone-operative', name: 'Lone Operative', type: 'rule' },
                { id: 'stealth-link', targetId: 'stealth', name: 'Stealth', type: 'rule' },
              ],
              profiles: [
                {
                  id: 'shroud-field-rule',
                  name: 'Shroud Field',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'PHOBOS model only. This model has:\n\n▪ Lone Operative.\n▪ Stealth.' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const unselected = [{ id: 'leader' }]
    const selected = [{ id: 'leader', selections: [{ id: 'shroud-field' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections: unselected, unitSelectionIndex: 0 })).not.toContain('Stealth')
    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections: selected, unitSelectionIndex: 0 })).toEqual(
      expect.arrayContaining(['Lone Operative', 'Stealth']),
    )
  })

  it.each(['This unit has Scouts 6".', 'Models in the bearer\'s unit have the Scouts 6" ability.'])(
    'does not infer an ability from a conditional structured grant: %s',
    (description) => {
      const book = bookOf({
        sharedRules: [{ id: 'scouts-6', name: 'Scouts 6"', description: 'Make a Scout move of up to 6".' }],
        selectionEntries: [
          {
            id: 'unit',
            name: 'Unit',
            type: 'unit',
            profiles: [
              {
                id: 'conditional-rule',
                name: 'Conditional rule',
                typeName: 'Abilities',
                characteristics: [{ name: 'Description', $text: description }],
              },
            ],
            modifiers: [
              {
                type: 'add',
                field: 'add-info',
                value: 'scouts-6',
                conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'roster', childId: 'condition' }],
              },
            ],
          },
        ],
      })

      expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }], unitSelectionIndex: 0 })?.abilities).not.toContainEqual(
        expect.objectContaining({ name: 'Scouts 6"', kind: 'core' }),
      )
    },
  )

  it('does not infer an ability from a conditional grant nested in a modifier group', () => {
    const book = bookOf({
      sharedRules: [{ id: 'scouts-6', name: 'Scouts 6"', description: 'Make a Scout move of up to 6".' }],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          profiles: [
            {
              id: 'conditional-rule',
              name: 'Conditional rule',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'This unit has Scouts 6".' }],
            },
          ],
          modifierGroups: [
            {
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'roster', childId: 'condition' }],
              modifiers: [{ type: 'add', field: 'add-info', value: 'scouts-6' }],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }], unitSelectionIndex: 0 })?.abilities).not.toContainEqual(
      expect.objectContaining({ name: 'Scouts 6"', kind: 'core' }),
    )
  })

  it.each([
    ['The bearer, and models in any unit they are leading, have the Infiltrators and Scouts 6" abilities.', ['Infiltrators', 'Scouts 6"']],
    ['Models in the bearer’s unit have the Stealth and Infiltrators abilities.', ['Stealth', 'Infiltrators']],
  ])('includes every deployment grant in selected enhancement wording: %s', (description, expected) => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntries: [
            {
              id: 'enhancement',
              name: 'Enhancement',
              type: 'upgrade',
              profiles: [
                {
                  id: 'enhancement-rule',
                  name: 'Enhancement',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: description }],
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'unit', selections: [{ id: 'enhancement' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })).toEqual(expect.arrayContaining(expected))
  })

  it('includes a deployment ability from a mixed linked ability grant', () => {
    const book = bookOf({
      sharedRules: [
        { id: 'lone-operative', name: 'Lone Operative', description: 'Lone Operative rule.' },
        { id: 'stealth', name: 'Stealth', description: 'Stealth rule.' },
      ],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntries: [
            {
              id: 'enhancement',
              name: 'Enhancement',
              type: 'upgrade',
              infoLinks: [
                { id: 'lone-operative-link', targetId: 'lone-operative', name: 'Lone Operative', type: 'rule' },
                { id: 'stealth-link', targetId: 'stealth', name: 'Stealth', type: 'rule' },
              ],
              profiles: [
                {
                  id: 'mixed-rule',
                  name: 'Mixed rule',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'The bearer has the Lone Operative and Stealth abilities.' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'unit', selections: [{ id: 'enhancement' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })).toEqual(
      expect.arrayContaining(['Lone Operative', 'Stealth']),
    )
  })

  it.each([
    'This unit has Deep Strike until the start of your next Shooting phase.',
    '- This unit has Deep Strike until the start of your next Shooting phase.',
    'The bearer has the Deep Strike ability until the start of your next Shooting phase.',
    'Until the start of your next Shooting phase, this model gains the Deep Strike ability.',
    'If this model destroys an enemy unit, it gains the Deep Strike ability.',
    'At the end of your opponent’s turn, roll one D6. If you do: - This unit has Deep Strike until the start of your next Shooting phase.',
  ])('does not make a temporary deployment ability permanent: %s', (description) => {
    const book = bookOf({
      sharedRules: [{ id: 'deep-strike', name: 'Deep Strike', description: 'Deep Strike rule.' }],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntries: [
            {
              id: 'enhancement',
              name: 'Enhancement',
              type: 'upgrade',
              infoLinks: [{ id: 'deep-strike-link', targetId: 'deep-strike', name: 'Deep Strike', type: 'rule' }],
              profiles: [
                {
                  id: 'temporary-rule',
                  name: 'Deep Strike',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: description }],
                },
              ],
            },
          ],
        },
      ],
    })

    const selections = [{ id: 'unit', selections: [{ id: 'enhancement' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })).not.toContain('Deep Strike')
  })

  it.each([
    ["CRYPTEK model only. Models in the bearer's unit have the Infiltrators ability.", 'Infiltrators'],
    [
      'ADEPTUS ASTARTES model only. Models in the bearer’s unit have the Deep Strike ability. In addition, Rapid Ingress costs 0CP.',
      'Deep Strike',
    ],
  ])('includes a selected enhancement deployment grant after its eligibility sentence', (description, ability) => {
    const ruleId = ability.toLocaleLowerCase().replaceAll(' ', '-')
    const book = bookOf({
      sharedRules: [{ id: ruleId, name: ability, description: `${ability} rule.` }],
      selectionEntries: [
        {
          id: 'leader',
          name: 'Leader',
          type: 'model',
          selectionEntries: [
            {
              id: 'enhancement',
              name: 'Enhancement',
              type: 'upgrade',
              profiles: [
                {
                  id: 'enhancement-rule',
                  name: 'Enhancement',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: description }],
                },
              ],
              modifiers: [{ type: 'add', field: 'add-info', value: ruleId, scope: 'parent', affects: 'group' }],
            },
          ],
        },
        { id: 'bodyguard', name: 'Bodyguard', type: 'unit' },
      ],
    })
    const selections = [{ id: 'leader', selections: [{ id: 'enhancement' }] }, { id: 'bodyguard' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'bodyguard', { selections, unitSelectionIndex: 1, companions: [0] })).toContain(ability)
  })

  it.each([
    [
      'Scouts 6"',
      'Adeptus Astartes Infantry model only. While the bearer is leading a unit, models in that unit have the Scouts 6" ability',
      'Scouts 6"',
    ],
    [
      'Super Runts',
      'While this model is leading a unit:\n- Models in that unit have the Scouts 9" ability.\n- Add 1 to the Hit roll.',
      'Scouts 9"',
    ],
    [
      'Forlorn Hero',
      'While this model is leading a unit, unless that unit starts the battle embarked within a Transport, models in that unit have the Scouts 6" ability.',
      'Scouts 6"',
    ],
    [
      'Shrouding (Psychic)',
      'While this model is leading a unit, models in that unit have the Stealth ability and that unit cannot be targeted by ranged attacks unless the attacking model is within 12".',
      'Stealth',
    ],
    [
      'Fire Riders',
      'While this model is leading a unit, models in that unit have the Deep Strike ability and each time a model in that unit makes a Normal, Advance, Fall Back or Charge move, it can move horizontally through models and terrain features.',
      'Deep Strike',
    ],
    [
      'Clandestine Investigator',
      "While this model is leading a unit, models in this unit have the Stealth ability. At the end of the battle, if this model's unit is wholly within your opponent's deployment zone, roll one D6: on a 4+, you gain 1 Investigation point.",
      'Stealth',
    ],
  ])('includes an attached-only deployment profile only on its attached unit: %s', (profileName, description, ability) => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'leader',
          name: 'Leader',
          type: 'model',
          selectionEntries: [
            {
              id: 'enhancement',
              name: 'Enhancement',
              type: 'upgrade',
              profiles: [
                {
                  id: 'scouts-rule',
                  name: profileName,
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: description }],
                },
              ],
            },
          ],
        },
        { id: 'bodyguard', name: 'Bodyguard', type: 'unit' },
      ],
    })
    const selections = [{ id: 'leader', selections: [{ id: 'enhancement' }] }, { id: 'bodyguard' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0 })).not.toContain(ability)
    expect(contextualAbilityNamesIn(book, 'cat', 'bodyguard', { selections, unitSelectionIndex: 1, companions: [0] })).toContain(ability)
  })

  it('shows an invulnerable save set by selected wargear on a blank characteristic', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Unit',
          type: 'unit',
          selectionEntries: [
            {
              id: 'model',
              name: 'Model',
              type: 'model',
              profiles: [
                {
                  id: 'model-profile',
                  name: 'Model',
                  typeName: 'Unit',
                  characteristics: [{ name: 'InSv', typeId: 'invulnerable-save', $text: '' }],
                },
              ],
              selectionEntries: [
                {
                  id: 'shield',
                  name: 'Shield',
                  type: 'upgrade',
                  modifiers: [
                    {
                      type: 'set',
                      value: '4+',
                      field: 'invulnerable-save',
                      scope: 'model',
                      affects: 'self.entries.recursive.profiles.Unit',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const selections = [{ id: 'unit', selections: [{ id: 'model', selections: [{ id: 'shield' }] }] }]

    expect(datasheetIn(book, 'cat', 'unit', { selections })?.profiles[0]?.values).toContainEqual({
      name: 'InSv',
      value: '4+',
      baseValue: '',
      modifiers: ['Shield'],
    })
  })

  it('reads a model invulnerable save when the catalogue only supplies its prose', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          profiles: [
            {
              id: 'captain-profile',
              name: 'Captain',
              typeName: 'Unit',
              characteristics: [{ name: 'InSv', typeId: 'invulnerable-save', $text: '' }],
            },
            {
              id: 'invulnerable-save',
              name: 'Invulnerable Save',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'This model has a 4+ invulnerable save.' }],
            },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'captain', { selections: [{ id: 'captain' }], unitSelectionIndex: 0 })?.profiles[0]?.values).toEqual([
      { name: 'InSv', value: '4+', baseValue: '', modifiers: ['Invulnerable Save'] },
    ])
  })
})
