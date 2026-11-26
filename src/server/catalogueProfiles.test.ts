import { describe, expect, it } from 'vitest'
import { contextualAbilityNamesIn, datasheetIn, datasheetViewsIn } from '../shared/catalogue'
import { bookOf, bookWithFacts, fixtureToken, profileOperationCases } from './catalogue.fixtures'
import { describeDatasheetAbilities } from '../shared/datasheetDescriptions'
import { defaultSelection } from '../core/expand'
import { combatTarget } from '../core/combatProfiles'

describe('the profile modifiers on a datasheet', () => {
  it.each([4, 10])('counts fixed weapons for a %i-model composition choice', (count) => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'unit',
          name: 'Squad',
          type: 'unit',
          selectionEntryGroups: [
            {
              id: 'composition',
              name: 'Unit Composition',
              defaultSelectionEntryId: 'size',
              constraints: [
                { id: 'required-size', type: 'min', value: 1, field: 'selections', scope: 'parent' },
                { id: 'maximum-size', type: 'max', value: 1, field: 'selections', scope: 'parent' },
              ],
              selectionEntries: [
                { id: 'other-size', name: '5 models', type: 'upgrade' },
                {
                  id: 'size',
                  name: `${count} models`,
                  type: 'upgrade',
                  selectionEntries: [
                    {
                      id: 'model',
                      name: 'Trooper',
                      type: 'model',
                      collective: true,
                      constraints: [{ id: 'required-models', type: 'min', value: count, field: 'selections', scope: 'parent' }],
                      selectionEntries: ['Ranged Weapons', 'Melee Weapons'].map((typeName, index) => ({
                        id: `weapon-${index}`,
                        name: `Weapon ${index}`,
                        type: 'upgrade' as const,
                        collective: true,
                        constraints: [
                          { id: `required-weapon-${index}`, type: 'min' as const, value: 1, field: 'selections', scope: 'parent' },
                        ],
                        profiles: [{ id: `profile-${index}`, name: `Weapon ${index}`, typeName }],
                      })),
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const selection = defaultSelection('unit', book.index, { primaryCatalogueId: 'cat' })!
    const views = datasheetViewsIn(book, 'cat', 'unit', { selections: [selection], unitSelectionIndex: 0 })
    expect(views.selected!.profiles.map(({ name, count: held }) => ({ name, count: held }))).toEqual([
      { name: 'Weapon 0', count },
      { name: 'Weapon 1', count },
    ])
  })

  it('preserves equipment ownership for inline and linked profiles with unrelated names', () => {
    const book = bookOf({
      sharedProfiles: [{ id: 'linked-mode', name: 'Alternate target', typeName: 'Ranged Weapons', characteristics: [] }],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'weapon',
              name: 'Rifle',
              type: 'upgrade',
              profiles: [{ id: 'inline-mode', name: 'Special attack', typeName: 'Ranged Weapons' }],
              infoLinks: [{ id: 'mode-link', targetId: 'linked-mode', type: 'profile' }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'unit')?.profiles.map(({ id, equipmentName }) => ({ id, equipmentName }))).toEqual([
      { id: 'inline-mode', equipmentName: 'Rifle' },
      { id: 'linked-mode', equipmentName: 'Rifle' },
    ])
  })

  it('shows an unconditional weapon ability granted by the selected detachment', () => {
    const categoryEntries = ['Necrons', 'Vehicle', 'Mounted', 'Titanic'].map((name) => ({
      id: name.toLocaleLowerCase(),
      name: name === 'Necrons' ? 'Faction: Necrons' : name,
    }))
    const unit = (id: string, keywords: string[]) => ({
      id,
      name: id,
      type: 'unit' as const,
      categoryLinks: keywords.map((keyword) => ({ id: `${id}-${keyword}`, targetId: keyword, name: keyword })),
      profiles: [
        {
          id: `${id}-gun`,
          name: 'Gauss gun',
          typeName: 'Ranged Weapons',
          characteristics: [{ name: 'Keywords', typeId: 'keywords', $text: 'Rapid Fire 1' }],
        },
      ],
    })
    const ruleText =
      'Each time a NECRONS model (excluding MONSTER models) from your army makes an attack that targets a unit within range of one or more objective markers, add 1 to the Hit roll. In addition, ranged weapons equipped by NECRONS VEHICLE and NECRONS MOUNTED models (excluding TITANIC models) from your army have the [ASSAULT] ability.'
    const cardText =
      'Each time a **NECRONS** model (excluding **MONSTER** models) from your army makes an attack that targets a unit within range of one or more objective markers, add 1 to the Hit roll. In addition, ranged weapons equipped by **NECRONS VEHICLE** and **NECRONS MOUNTED** models (excluding **TITANIC** models) from your army have the **[ASSAULT]** ability.'
    const assault = {
      weaponAbilities: [
        {
          ability: 'ASSAULT',
          attacks: ['ranged'],
          to: 'army',
          keywords: ['NECRONS VEHICLE', 'NECRONS MOUNTED'],
          excludedKeywords: ['TITANIC'],
        },
      ],
    }
    const book = bookWithFacts(
      {
        sharedRules: [
          {
            id: 'relentless-onslaught',
            name: 'Relentless Onslaught',
            description: ruleText,
          },
        ],
        categoryEntries,
        selectionEntries: [
          {
            id: 'detachments',
            name: 'Detachment',
            type: 'upgrade',
            selectionEntryGroups: [
              {
                id: 'detachment-choices',
                name: 'Detachment choice',
                selectionEntries: [
                  {
                    id: 'starshatter',
                    name: 'Starshatter Arsenal',
                    type: 'upgrade',
                    infoLinks: [{ id: 'relentless-link', targetId: 'relentless-onslaught', name: 'Relentless Onslaught', type: 'rule' }],
                  },
                ],
              },
            ],
          },
          unit('ark', ['necrons', 'vehicle']),
          unit('destroyer', ['necrons', 'mounted']),
          unit('monolith', ['necrons', 'vehicle', 'titanic']),
          unit('warriors', ['necrons']),
        ],
      },
      { [ruleText]: assault, [cardText]: assault },
    )
    book.datacards.detachmentRules = new Map([
      [
        'starshatter-arsenal',
        [
          {
            name: 'Relentless Onslaught',
            description: fixtureToken(cardText),
          },
        ],
      ],
    ])
    const detachment = {
      id: 'detachments',
      selections: [{ id: 'detachment-choices', selections: [{ id: 'starshatter' }] }],
    }
    const weaponKeywords = (entryId: string, selected = true) => {
      const selections = [...(selected ? [detachment] : []), { id: entryId }]
      return datasheetIn(book, 'cat', entryId, {
        selections,
        unitSelectionIndex: selections.length - 1,
      })?.profiles[0]?.values[0]
    }

    expect(weaponKeywords('ark')).toEqual({
      name: 'Keywords',
      value: 'Rapid Fire 1, Assault',
      baseValue: 'Rapid Fire 1',
      modifiers: ['Relentless Onslaught'],
    })
    expect(weaponKeywords('destroyer')?.value).toBe('Rapid Fire 1, Assault')
    expect(weaponKeywords('monolith')?.value).toBe('Rapid Fire 1')
    expect(weaponKeywords('warriors')?.value).toBe('Rapid Fire 1')
    expect(weaponKeywords('ark', false)?.value).toBe('Rapid Fire 1')
  })

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

  it('keeps the invulnerable save of models whose shared profile another model’s link removes it from', () => {
    const fielded = (id: string, value: number) => [{ id: `${id}-size`, type: 'min' as const, value, field: 'selections', scope: 'parent' }]
    const book = bookOf({
      sharedProfiles: [
        {
          id: 'shared-profile',
          name: 'Trooper',
          typeName: 'Unit',
          characteristics: [
            { name: 'T', typeId: 'toughness', $text: '3' },
            { name: 'Sv', typeId: 'save', $text: '3+' },
            { name: 'W', typeId: 'wounds', $text: '1' },
            { name: 'InSv', typeId: 'invulnerable', $text: '4+' },
          ],
        },
      ],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'trooper',
              name: 'Trooper',
              type: 'model',
              constraints: fielded('trooper', 2),
              infoLinks: [{ id: 'trooper-link', targetId: 'shared-profile', type: 'profile' }],
            },
            {
              id: 'hound',
              name: 'Hound',
              type: 'model',
              constraints: fielded('hound', 1),
              infoLinks: [
                {
                  id: 'hound-link',
                  targetId: 'shared-profile',
                  type: 'profile',
                  modifiers: [
                    { type: 'set', field: 'invulnerable', value: '' },
                    { type: 'set', field: 'name', value: 'Hound' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    const selection = defaultSelection('unit', book.index, { primaryCatalogueId: 'cat' })!
    const views = datasheetViewsIn(book, 'cat', 'unit', { selections: [selection], unitSelectionIndex: 0 })
    expect(
      combatTarget(views.selected!, 3, 3, views.carriers).target?.groups.map(({ models, invulnerable }) => ({ models, invulnerable })),
    ).toEqual([
      { models: 2, invulnerable: 4 },
      { models: 1, invulnerable: null },
    ])
  })

  it('keeps a chosen weapon whose shared profile an unchosen option also links', () => {
    const chainsword = (id: string) => ({
      id,
      name: 'Chainsword',
      type: 'upgrade' as const,
      infoLinks: [{ id: `${id}-link`, targetId: 'chainsword-profile', type: 'profile' as const }],
    })
    const book = bookOf({
      sharedProfiles: [{ id: 'chainsword-profile', name: 'Chainsword', typeName: 'Melee Weapons', characteristics: [] }],
      selectionEntries: [
        {
          id: 'unit',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            { id: 'sergeant', name: 'Sergeant', type: 'model', selectionEntries: [chainsword('sergeant-chainsword')] },
            { id: 'trooper', name: 'Trooper', type: 'model', selectionEntries: [chainsword('trooper-chainsword')] },
          ],
        },
      ],
    })
    const selections = [{ id: 'unit', selections: [{ id: 'sergeant', selections: [{ id: 'sergeant-chainsword' }] }, { id: 'trooper' }] }]

    expect(datasheetIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })?.profiles.map(({ name }) => name)).toContain(
      'Chainsword',
    )
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

  it('comma-separates a weapon keyword appended without an explicit join', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'company',
          name: 'Company of Hunters',
          type: 'upgrade',
          modifiers: [
            {
              type: 'append',
              field: 'keywords',
              value: 'Assault',
              scope: 'force',
              affects: 'self.entries.recursive.profiles.Ranged Weapons',
            },
          ],
        },
        {
          id: 'speeder',
          name: 'Land Speeder Vengeance',
          type: 'unit',
          profiles: [
            {
              id: 'battery',
              name: 'Plasma storm battery',
              typeName: 'Ranged Weapons',
              characteristics: [{ name: 'Keywords', typeId: 'keywords', $text: 'Blast, Twin-Linked' }],
            },
            {
              id: 'bolt-pistol',
              name: 'Bolt pistol',
              typeName: 'Ranged Weapons',
              characteristics: [{ name: 'Keywords', typeId: 'keywords', $text: 'Pistol, Assault' }],
            },
          ],
        },
      ],
    })

    const profiles = datasheetIn(book, 'cat', 'speeder', {
      selections: [{ id: 'company' }, { id: 'speeder' }],
      unitSelectionIndex: 1,
    })?.profiles

    expect(profiles?.[0]?.values[0]).toEqual({
      name: 'Keywords',
      value: 'Blast, Twin-Linked, Assault',
      baseValue: 'Blast, Twin-Linked',
      modifiers: ['Company of Hunters'],
    })
    expect(profiles?.[1]?.values[0]).toEqual({ name: 'Keywords', value: 'Pistol, Assault' })
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

  it.each([
    {
      description: 'While this model is leading a unit, weapons equipped by models in that unit have the [LETHAL HITS] ability.',
      keyword: 'Lethal Hits',
      appliesAlone: false,
      blocks: { weaponAbilities: [{ ability: 'LETHAL HITS', attacks: ['ranged', 'melee'], to: 'led-unit' }] },
    },
    {
      description: 'Weapons equipped by models in this model’s unit have the **[SUSTAINED HITS 1]** ability.',
      keyword: 'Sustained Hits 1',
      appliesAlone: true,
      blocks: {
        weaponAbilities: [
          { ability: 'SUSTAINED HITS 1', attacks: ['ranged', 'melee'], to: 'own-unit' },
          { ability: 'SUSTAINED HITS 1', attacks: ['ranged', 'melee'], to: 'led-unit' },
        ],
      },
    },
  ])('gives an attached unit the weapon ability its rule grants: $keyword', ({ description, keyword, appliesAlone, blocks }) => {
    const weapon = (id: string, typeName: string) => ({
      id,
      name: 'Weapon',
      typeName,
      characteristics: [{ name: 'S', typeId: 'strength', $text: '5' }],
    })
    const book = bookWithFacts(
      {
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
                    $text: description,
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
      },
      { [description]: blocks },
    )
    const selections = [{ id: 'captain' }, { id: 'veterans' }]
    const keywords = (entryId: string, unitSelectionIndex: number, companions: number[]) =>
      datasheetIn(book, 'cat', entryId, { selections, unitSelectionIndex, companions })?.profiles.flatMap((profile) =>
        profile.values.filter((value) => value.name === 'Keywords'),
      )

    expect(keywords('captain', 0, [1])).toEqual([{ name: 'Keywords', value: keyword, baseValue: '', modifiers: ['Tactical Instinct'] }])
    expect(keywords('veterans', 1, [0])).toEqual([
      { name: 'Keywords', value: keyword, baseValue: '', modifiers: ['Tactical Instinct'] },
      { name: 'Keywords', value: keyword, baseValue: '', modifiers: ['Tactical Instinct'] },
    ])
    expect(keywords('veterans', 1, [])).toEqual([])
    expect(keywords('captain', 0, [])).toEqual(
      appliesAlone ? [{ name: 'Keywords', value: keyword, baseValue: '', modifiers: ['Tactical Instinct'] }] : [],
    )
  })

  it('shows abilities granted by enhancements and attached units as core abilities', () => {
    const grantedAbility = (id: string, name: string, description: string) => ({
      id,
      name,
      typeName: 'Abilities',
      characteristics: [{ name: 'Description', $text: description }],
    })
    const book = bookWithFacts(
      {
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
      },
      {
        'While this model is leading a unit, models in that unit have the [STEALTH] ability.': {
          grants: { abilities: [{ ability: 'Stealth', to: 'unit', named: true, whileAttached: true }] },
        },
        'The bearer has the Feel No Pain 5+ ability.': {
          grants: { abilities: [{ ability: 'Feel No Pain 5+', to: 'bearer', named: true }] },
        },
        'While a ^^**Character^^** model is leading this unit, that ^^**Character^^** model has the Feel No Pain 4+ ability.': {
          grants: {
            abilities: [{ ability: 'Feel No Pain 4+', to: 'leader', named: true, whileAttached: true, counterpart: ['CHARACTER'] }],
          },
        },
        '**^^Adeptus Astartes^^** model only. The bearer has a Save characteristic of 2+ and the Feel No Pain 6+ ability.': {
          grants: { abilities: [{ ability: 'Feel No Pain 6+', to: 'bearer', named: true }] },
        },
      },
    )
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

  it('does not read an invulnerable save as a granted ability', () => {
    const book = bookOf({
      sharedRules: [{ id: 'power-from-pain', name: 'Power From Pain', description: 'Grow stronger.' }],
      selectionEntries: [
        {
          id: 'wyches',
          name: 'Wyches',
          type: 'unit',
          profiles: [
            {
              id: 'invulnerable',
              name: 'Invulnerable Save (4+*)',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'Models in this unit have a 4+ invulnerable save against melee attacks.' }],
            },
          ],
          infoLinks: [{ id: 'power-link', targetId: 'power-from-pain', name: 'Power From Pain', type: 'rule' }],
        },
      ],
    })
    expect(
      datasheetIn(book, 'cat', 'wyches', { selections: [{ id: 'wyches' }], unitSelectionIndex: 0 })?.abilities.filter((ability) =>
        ability.id.startsWith('granted:'),
      ),
    ).toEqual([])
  })

  describe('a Feel No Pain a joined model links from the shared library for models with a keyword', () => {
    const book = () =>
      bookWithFacts(
        {
          categoryEntries: [{ id: 'officer', name: 'Officer' }],
          sharedProfiles: [
            {
              id: 'ogryn-bodyguard',
              name: 'Ogryn Bodyguard',
              typeName: 'Abilities',
              characteristics: [
                {
                  name: 'Description',
                  $text:
                    'While one or more **^^Officer^^** models are in the same unit as this model, those **^^Officer^^** models have the Feel No Pain 4+ ability',
                },
              ],
            },
          ],
          selectionEntries: [
            {
              id: 'protector',
              name: 'Protector',
              type: 'model',
              infoLinks: [{ id: 'bodyguard-link', targetId: 'ogryn-bodyguard', name: 'Ogryn Bodyguard', type: 'profile' }],
            },
            {
              id: 'command',
              name: 'Command Squad',
              type: 'unit',
              categoryLinks: [{ id: 'command-officer', targetId: 'officer', name: 'Officer' }],
            },
            { id: 'squad', name: 'Squad', type: 'unit' },
          ],
        },
        {
          'While one or more **^^Officer^^** models are in the same unit as this model, those **^^Officer^^** models have the Feel No Pain 4+ ability':
            { grants: { abilities: [{ ability: 'Feel No Pain 4+', to: 'models', models: 'OFFICER', named: true }] } },
        },
      )
    const selections = [{ id: 'command' }, { id: 'protector' }]

    it('gives it to the unit it joined, for those models only', () => {
      expect(datasheetIn(book(), 'cat', 'command', { selections, unitSelectionIndex: 0, companions: [1] })?.abilities).toContainEqual({
        id: 'granted:ogryn-bodyguard',
        name: 'Feel No Pain 4+',
        source: 'Ogryn Bodyguard',
        description: null,
        kind: 'core',
        models: 'OFFICER',
      })
    })

    it('does not give it to a unit without that keyword', () => {
      expect(
        datasheetIn(book(), 'cat', 'squad', { selections: [{ id: 'squad' }, { id: 'protector' }], unitSelectionIndex: 0, companions: [1] })
          ?.abilities,
      ).not.toContainEqual(expect.objectContaining({ name: 'Feel No Pain 4+' }))
    })

    it('does not give it to the model that grants it', () => {
      expect(datasheetIn(book(), 'cat', 'protector', { selections, unitSelectionIndex: 1, companions: [0] })?.abilities).not.toContainEqual(
        expect.objectContaining({ name: 'Feel No Pain 4+' }),
      )
    })
  })

  it('grants Stealth from a companion whose own unit has Stealth', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        '- This unit has Stealth. \n- Melee attacks that target this unit have -1 to hit rolls.': {
          grants: { abilities: [{ ability: 'Stealth', to: 'unit', named: true }] },
        },
      },
    )
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
    const book = bookWithFacts(
      {
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
      },
      {
        'This unit has Scouts 5".': { grants: { abilities: [{ ability: 'Scouts 5"', to: 'unit', named: true }] } },
      },
    )
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

  it('shows and applies only the wargear abilities a unit selected', () => {
    const book = bookWithFacts(
      {
        selectionEntries: [
          {
            id: 'unit',
            name: 'Unit',
            type: 'unit',
            profiles: [
              {
                id: 'rifle-profile',
                name: 'Rifle',
                typeName: 'Ranged Weapons',
                characteristics: [{ name: 'Keywords', $text: 'Lethal Hits' }],
              },
            ],
            selectionEntries: [
              {
                id: 'scope',
                name: 'Targeting scope',
                type: 'upgrade',
                profiles: [
                  {
                    id: 'scope-ability',
                    name: 'Targeting scope',
                    typeName: 'Abilities',
                    characteristics: [
                      { name: 'Description', $text: 'Ranged weapons equipped by the bearer have the [IGNORES COVER] ability.' },
                    ],
                  },
                ],
              },
              {
                id: 'cloak',
                name: 'Shadow cloak',
                type: 'upgrade',
                profiles: [
                  {
                    id: 'cloak-ability',
                    name: 'Shadow cloak',
                    typeName: 'Abilities',
                    characteristics: [{ name: 'Description', $text: 'The bearer has the Stealth ability.' }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        'Ranged weapons equipped by the bearer have the [IGNORES COVER] ability.': {
          weaponAbilities: [{ ability: 'IGNORES COVER', attacks: ['ranged'], to: 'bearer' }],
        },
        'The bearer has the Stealth ability.': { grants: { abilities: [{ ability: 'Stealth', to: 'bearer', named: true }] } },
      },
    )
    const unselected = datasheetIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }], unitSelectionIndex: 0 })!
    const unselectedViews = datasheetViewsIn(book, 'cat', 'unit', { selections: [{ id: 'unit' }], unitSelectionIndex: 0 })
    const scope = datasheetIn(book, 'cat', 'unit', {
      selections: [{ id: 'unit', selections: [{ id: 'scope' }] }],
      unitSelectionIndex: 0,
    })!
    const cloak = datasheetIn(book, 'cat', 'unit', {
      selections: [{ id: 'unit', selections: [{ id: 'cloak' }] }],
      unitSelectionIndex: 0,
    })!

    expect(unselected.abilities).toEqual([])
    expect(unselectedViews.selected?.abilities).toEqual([])
    expect(unselectedViews.available?.abilities.map(({ name }) => name)).toEqual(['Targeting scope', 'Shadow cloak'])
    expect(scope.abilities).toEqual([expect.objectContaining({ name: 'Targeting scope', kind: 'wargear' })])
    expect(scope.profiles[0]?.values).toContainEqual({
      name: 'Keywords',
      value: 'Lethal Hits, Ignores Cover',
      baseValue: 'Lethal Hits',
      modifiers: ['Targeting scope'],
    })
    expect(cloak.abilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Shadow cloak', kind: 'wargear' }),
        expect.objectContaining({ name: 'Stealth', kind: 'core', source: 'Shadow cloak' }),
      ]),
    )
    expect(cloak.abilities).not.toContainEqual(expect.objectContaining({ name: 'Targeting scope' }))
  })

  it.each([
    ['Deep Strike', 'This unit can be set up in Reserves.', 'Deep Strike'],
    ['Deep Strike', 'Models in this unit have the Deep Strike ability.', 'Deep Strike'],
    ['Deep Strike', 'If every model in this unit has the Deep Strike ability, it can be set up in Reserves.', 'Deep Strike'],
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

  it('includes a deployment ability an upgrade grants only when the upgrade is selected', () => {
    const description = 'Models in this unit have the Infiltrators ability.'
    const book = bookWithFacts(
      {
        selectionEntries: [
          {
            id: 'unit',
            name: 'Unit',
            type: 'unit',
            selectionEntries: [
              {
                id: 'cloak',
                name: 'Cloak',
                type: 'upgrade',
                profiles: [
                  {
                    id: 'wraith',
                    name: 'Wraith of Ruin',
                    typeName: 'Abilities',
                    characteristics: [{ name: 'Description', $text: description }],
                  },
                ],
              },
            ],
          },
        ],
      },
      { [description]: { grants: { abilities: [{ ability: 'Infiltrators', to: 'unit', named: true }] } } },
    )
    const names = (selections: { id: string; selections?: { id: string }[] }[]) =>
      contextualAbilityNamesIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })
    expect(
      [names([{ id: 'unit' }]), names([{ id: 'unit', selections: [{ id: 'cloak' }] }])].map((found) => found.includes('Infiltrators')),
    ).toEqual([false, true])
  })

  it('applies attachment grants only for the named bodyguard unit', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        'If this model is attached to a Dominion Squad during the Declare Battle Formations step, it gains the Scouts 6" ability. If this model is attached to a Sisters Novitiate Squad during the Declare Battle Formations step, it gains the Infiltrators ability.':
          {
            grants: {
              abilities: [
                { ability: 'Scouts 6"', to: 'bearer', named: true, whileAttached: true, counterpart: ['DOMINION SQUAD'] },
                { ability: 'Infiltrators', to: 'bearer', named: true, whileAttached: true, counterpart: ['SISTERS NOVITIATE SQUAD'] },
              ],
            },
          },
      },
    )
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
    const book = bookWithFacts(
      {
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
      },
      {
        'If this model is attached to a Canoptek Macrocytes unit during the Declare Battle Formations step, this model has the Scouts 8" ability.':
          {
            grants: {
              abilities: [{ ability: 'Scouts 8"', to: 'bearer', named: true, whileAttached: true, counterpart: ['CANOPTEK MACROCYTES'] }],
            },
          },
      },
    )
    const abilitiesWith = (bodyguard: { id: string }) => {
      const selections = [{ id: 'leader' }, bodyguard]
      return contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith({ id: 'macrocytes' })).toContain('Scouts 8"')
    expect(abilitiesWith({ id: 'warriors' })).not.toContain('Scouts 8"')
  })

  it('matches an attachment grant against all bodyguard keyword classes', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        'If this model is attached to an Emperor\'s Children Battleline unit during the Declare Battle Formations step, this model has the Infiltrators and Scouts 6" ability.':
          {
            grants: {
              abilities: [
                { ability: 'Infiltrators', to: 'bearer', named: true, whileAttached: true, counterpart: ["EMPEROR'S CHILDREN BATTLELINE"] },
                { ability: 'Scouts 6"', to: 'bearer', named: true, whileAttached: true, counterpart: ["EMPEROR'S CHILDREN BATTLELINE"] },
              ],
            },
          },
      },
    )
    const abilitiesWith = (bodyguard: { id: string }) => {
      const selections = [{ id: 'leader' }, bodyguard]
      return contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith({ id: 'infractors' })).toEqual(expect.arrayContaining(['Infiltrators', 'Scouts 6"']))
    expect(abilitiesWith({ id: 'other-battleline' })).not.toContain('Infiltrators')
  })

  it('applies an attached bodyguard grant to its leader', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        'If this unit has a Leader unit attached to it during the Declare Battle Formations step, that Leader unit gains the Infiltrators and Scouts 6" abilities.':
          {
            grants: {
              abilities: [
                { ability: 'Infiltrators', to: 'leader', named: true, whileAttached: true },
                { ability: 'Scouts 6"', to: 'leader', named: true, whileAttached: true },
              ],
            },
          },
      },
    )
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
    const book = bookWithFacts(
      {
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
      },
      {
        'If a Ministorum Priest model from your army is attached to this unit during the Declare Battle Formations step, that model gains the Scouts 6" ability.':
          {
            grants: {
              abilities: [{ ability: 'Scouts 6"', to: 'leader', named: true, whileAttached: true, counterpart: ['MINISTORUM PRIEST'] }],
            },
          },
      },
    )
    const abilitiesFor = (leaderId: string) => {
      const selections = [{ id: leaderId }, { id: 'sanctifiers' }]
      return contextualAbilityNamesIn(book, 'cat', leaderId, { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesFor('priest')).toContain('Scouts 6"')
    expect(abilitiesFor('canoness')).not.toContain('Scouts 6"')
  })

  it('applies a named leader grant to every model in its attached unit', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        'While a Brotherhood Techmarine model is leading this unit, models in this unit have the Deep Strike and Teleport Assault abilities.':
          {
            grants: {
              abilities: [
                { ability: 'Deep Strike', to: 'unit', named: true, whileAttached: true, counterpart: ['BROTHERHOOD TECHMARINE'] },
                { ability: 'Teleport Assault', to: 'unit', named: true, whileAttached: true, counterpart: ['BROTHERHOOD TECHMARINE'] },
              ],
            },
          },
      },
    )
    const selections = [{ id: 'techmarine' }, { id: 'servitors' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'techmarine', { selections, unitSelectionIndex: 0, companions: [1] })).toContain(
      'Deep Strike',
    )
    expect(contextualAbilityNamesIn(book, 'cat', 'servitors', { selections, unitSelectionIndex: 1, companions: [0] })).toContain(
      'Deep Strike',
    )
  })

  it('applies the grant for the bodyguard unit this model is leading', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        'While this model is leading a Howling Banshees unit, it has the Fights First ability. While this model is leading a Striking Scorpions unit, it has the Infiltrators, Scouts 7" and Stealth abilities.':
          {
            grants: {
              abilities: [
                { ability: 'Fights First', to: 'bearer', named: true, whileAttached: true, counterpart: ['HOWLING BANSHEES'] },
                { ability: 'Infiltrators', to: 'bearer', named: true, whileAttached: true, counterpart: ['STRIKING SCORPIONS'] },
                { ability: 'Scouts 7"', to: 'bearer', named: true, whileAttached: true, counterpart: ['STRIKING SCORPIONS'] },
                { ability: 'Stealth', to: 'bearer', named: true, whileAttached: true, counterpart: ['STRIKING SCORPIONS'] },
              ],
            },
          },
      },
    )
    const abilitiesWith = (bodyguardId: string) => {
      const selections = [{ id: 'leader' }, { id: bodyguardId }]
      return contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })
    }

    expect(abilitiesWith('scorpions')).toEqual(expect.arrayContaining(['Infiltrators', 'Scouts 7"', 'Stealth']))
    expect(abilitiesWith('scorpions')).not.toContain('Fights First')
    expect(abilitiesWith('banshees')).toContain('Fights First')
  })

  it('keeps both halves of a bearer and attached-unit grant', () => {
    const book = bookWithFacts(
      {
        selectionEntries: [
          {
            id: 'leader',
            name: 'Marshal',
            type: 'model',
            selectionEntries: [
              {
                id: 'crusaders-helm',
                name: "Crusader's Helm",
                type: 'upgrade',
                profiles: [
                  {
                    id: 'crusaders-helm-rule',
                    name: "Crusader's Helm",
                    typeName: 'Abilities',
                    characteristics: [
                      {
                        name: 'Description',
                        $text:
                          'The bearer has the Scouts 6" ability. While the bearer is leading a unit, models in that unit have the Scouts 6" ability and that unit can declare a charge after Advancing.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { id: 'bodyguard', name: 'Crusaders', type: 'unit' },
        ],
      },
      {
        'The bearer has the Scouts 6" ability. While the bearer is leading a unit, models in that unit have the Scouts 6" ability and that unit can declare a charge after Advancing.':
          {
            grants: {
              abilities: [
                { ability: 'Scouts 6"', to: 'bearer', named: true },
                { ability: 'Scouts 6"', to: 'unit', named: true, whileAttached: true },
              ],
            },
          },
      },
    )
    const selections = [{ id: 'leader', selections: [{ id: 'crusaders-helm' }] }, { id: 'bodyguard' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0, companions: [1] })).toContain('Scouts 6"')
    expect(contextualAbilityNamesIn(book, 'cat', 'bodyguard', { selections, unitSelectionIndex: 1, companions: [0] })).toContain(
      'Scouts 6"',
    )
  })

  it('applies a permanent unit grant declared when the model is attached', () => {
    const book = bookWithFacts(
      {
        selectionEntries: [
          {
            id: 'leader',
            name: 'Captain',
            type: 'model',
            selectionEntries: [
              {
                id: 'teleport-homer',
                name: 'Teleport Homer',
                type: 'upgrade',
                profiles: [
                  {
                    id: 'teleport-homer-rule',
                    name: 'Teleport Homer',
                    typeName: 'Abilities',
                    characteristics: [
                      {
                        name: 'Description',
                        $text:
                          'During the Declare Battle Formations step, if this model is attached a unit, until the end of the battle, that unit has the Deep Strike ability.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { id: 'bodyguard', name: 'Intercessors', type: 'unit' },
        ],
      },
      {
        'During the Declare Battle Formations step, if this model is attached a unit, until the end of the battle, that unit has the Deep Strike ability.':
          { grants: { abilities: [{ ability: 'Deep Strike', to: 'unit', named: true, whileAttached: true }] } },
      },
    )
    const unattached = [{ id: 'leader', selections: [{ id: 'teleport-homer' }] }]
    const attached = [...unattached, { id: 'bodyguard' }]

    expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections: unattached, unitSelectionIndex: 0 })).not.toContain('Deep Strike')
    expect(contextualAbilityNamesIn(book, 'cat', 'bodyguard', { selections: attached, unitSelectionIndex: 1, companions: [0] })).toContain(
      'Deep Strike',
    )
  })

  it('applies an ability granted to the named led unit', () => {
    const book = bookWithFacts(
      {
        categoryEntries: [{ id: 'regiment', name: 'Regiment' }],
        selectionEntries: [
          {
            id: 'leader',
            name: 'Commander',
            type: 'model',
            selectionEntries: [
              {
                id: 'eager-advance',
                name: 'Eager Advance',
                type: 'upgrade',
                profiles: [
                  {
                    id: 'eager-advance-rule',
                    name: 'Eager Advance',
                    typeName: 'Abilities',
                    characteristics: [
                      {
                        name: 'Description',
                        $text: 'While the bearer is leading a Regiment unit, that unit has the Scouts 6" ability.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            id: 'regiment-unit',
            name: 'Infantry Squad',
            type: 'unit',
            categoryLinks: [{ id: 'regiment-link', targetId: 'regiment', name: 'Regiment' }],
          },
          { id: 'other-unit', name: 'Ogryns', type: 'unit' },
        ],
      },
      {
        'While the bearer is leading a Regiment unit, that unit has the Scouts 6" ability.': {
          grants: { abilities: [{ ability: 'Scouts 6"', to: 'unit', named: true, whileAttached: true, counterpart: ['REGIMENT'] }] },
        },
      },
    )
    const abilitiesWith = (bodyguardId: string) => {
      const selections = [{ id: 'leader', selections: [{ id: 'eager-advance' }] }, { id: bodyguardId }]
      return contextualAbilityNamesIn(book, 'cat', bodyguardId, { selections, unitSelectionIndex: 1, companions: [0] })
    }

    expect(abilitiesWith('regiment-unit')).toContain('Scouts 6"')
    expect(abilitiesWith('other-unit')).not.toContain('Scouts 6"')
  })

  it('includes each static linked ability only while its enhancement is selected', () => {
    const book = bookWithFacts(
      {
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
                    characteristics: [
                      { name: 'Description', $text: 'PHOBOS model only. This model has:\n\n▪ Lone Operative.\n▪ Stealth.' },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        'PHOBOS model only. This model has:\n\n▪ Lone Operative.\n▪ Stealth.': {
          grants: {
            abilities: [
              { ability: 'Lone Operative', to: 'bearer', named: true },
              { ability: 'Stealth', to: 'bearer', named: true },
            ],
          },
        },
      },
    )
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

  it('includes a deployment ability from a mixed linked ability grant', () => {
    const book = bookWithFacts(
      {
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
      },
      {
        'The bearer has the Lone Operative and Stealth abilities.': {
          grants: {
            abilities: [
              { ability: 'Lone Operative', to: 'bearer', named: true },
              { ability: 'Stealth', to: 'bearer', named: true },
            ],
          },
        },
      },
    )
    const selections = [{ id: 'unit', selections: [{ id: 'enhancement' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })).toEqual(
      expect.arrayContaining(['Lone Operative', 'Stealth']),
    )
  })

  it('does not make a deployment ability VS Data grants only under a condition permanent', () => {
    const description = 'This unit has Deep Strike until the start of your next Shooting phase.'
    const book = bookWithFacts(
      {
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
      },
      {
        [description]: { grants: { abilities: [{ ability: 'Deep Strike', to: 'unit', named: true, conditional: true }] } },
      },
    )

    const selections = [{ id: 'unit', selections: [{ id: 'enhancement' }] }]

    expect(contextualAbilityNamesIn(book, 'cat', 'unit', { selections, unitSelectionIndex: 0 })).not.toContain('Deep Strike')
  })

  it.each([['Shrouding (Psychic)', 'While this model is leading a unit, models in that unit have the Stealth ability.', 'Stealth']])(
    'includes an attached-only deployment profile only on its attached unit: %s',
    (profileName, description, ability) => {
      const book = bookWithFacts(
        {
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
        },
        { [description]: { grants: { abilities: [{ ability, to: 'unit', named: true, whileAttached: true }] } } },
      )
      const selections = [{ id: 'leader', selections: [{ id: 'enhancement' }] }, { id: 'bodyguard' }]

      expect(contextualAbilityNamesIn(book, 'cat', 'leader', { selections, unitSelectionIndex: 0 })).not.toContain(ability)
      expect(contextualAbilityNamesIn(book, 'cat', 'bodyguard', { selections, unitSelectionIndex: 1, companions: [0] })).toContain(ability)
    },
  )

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

  it('reads a model invulnerable save the catalogue gives as an ability of that value, on its datasheet as in a roster', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'tycho',
          name: 'Captain Tycho',
          type: 'model',
          profiles: [
            { id: 'tycho-profile', name: 'Captain Tycho', typeName: 'Unit', characteristics: [{ name: 'Sv', $text: '2+' }] },
            { id: 'tycho-save', name: 'Invulnerable Save', typeName: 'Abilities', characteristics: [{ name: 'Description', $text: '4+' }] },
          ],
        },
      ],
    })
    const saveOf = (context?: Parameters<typeof datasheetIn>[3]) =>
      datasheetIn(book, 'cat', 'tycho', context)?.profiles[0]?.values.find((value) => value.name === 'InSv')?.value
    expect([saveOf(), saveOf({ selections: [{ id: 'tycho' }], unitSelectionIndex: 0 })]).toEqual(['4+', '4+'])
  })

  it('gives a model’s own invulnerable save to that model alone, on its datasheet as in a roster', () => {
    const model = (id: string, save?: string) => ({
      id,
      name: id,
      type: 'model' as const,
      profiles: [
        { id: `${id}-profile`, name: id, typeName: 'Unit', characteristics: [{ name: 'Sv', $text: '3+' }] },
        ...(save
          ? [
              {
                id: `${id}-save`,
                name: 'Invulnerable Save',
                typeName: 'Abilities',
                characteristics: [{ name: 'Description', $text: save }],
              },
            ]
          : []),
      ],
    })
    const book = bookOf({
      selectionEntries: [
        { id: 'kill-team', name: 'Kill Team', type: 'unit', selectionEntries: [model('Veteran'), model('Terminator', '4+')] },
      ],
    })
    const savesOf = (context?: Parameters<typeof datasheetIn>[3]) =>
      datasheetIn(book, 'cat', 'kill-team', context)?.profiles.map(
        (profile) => profile.values.find((value) => value.name === 'InSv')?.value,
      )
    const fielded = { selections: [{ id: 'kill-team', selections: [{ id: 'Veteran' }, { id: 'Terminator' }] }], unitSelectionIndex: 0 }
    expect([savesOf(), savesOf(fielded)]).toEqual([
      [undefined, '4+'],
      [undefined, '4+'],
    ])
  })

  it('shows a model invulnerable save its own ability gives', () => {
    const book = bookWithFacts(
      {
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
      },
      { 'This model has a 4+ invulnerable save.': { invulnerableSave: { roll: 4 } } },
    )

    expect(datasheetIn(book, 'cat', 'captain', { selections: [{ id: 'captain' }], unitSelectionIndex: 0 })?.profiles[0]?.values).toEqual([
      { name: 'InSv', value: '4+' },
    ])
  })
})
