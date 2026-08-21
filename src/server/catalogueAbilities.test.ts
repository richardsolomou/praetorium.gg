import { describe, expect, it } from 'vitest'
import { datasheetIn, rulesReferencedIn } from './catalogue'
import { ability, bookOf, shelfOf } from './catalogue.fixtures'

describe('the abilities and wargear a datasheet lists', () => {
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
    expect(
      datasheetIn(book, 'cat', 'immortals', {
        selections: [{ id: 'immortals', selections: [{ id: 'enhancements', selections: [{ id: 'tools' }] }] }],
        unitSelectionIndex: 0,
      })?.abilities.map(({ name }) => name),
    ).toEqual(['Implacable Eradication', 'Tools of Dominion'])
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
})
