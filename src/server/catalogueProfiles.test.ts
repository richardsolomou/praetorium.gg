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

  it('includes an optional deployment ability only when its upgrade is selected', () => {
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
                  name: 'Deep Strike',
                  typeName: 'Abilities',
                  characteristics: [{ name: 'Description', $text: 'This unit can be set up in Reserves.' }],
                },
              ],
            },
          ],
        },
      ],
    })
    const unselected = [{ id: 'unit' }]
    const selected = [{ id: 'unit', selections: [{ id: 'teleporter' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections: unselected, unitSelectionIndex: 0 })).not.toContain('Deep Strike')
    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections: selected, unitSelectionIndex: 0 })).toContain('Deep Strike')
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
