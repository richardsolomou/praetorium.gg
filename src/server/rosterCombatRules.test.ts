import { describe, expect, it } from 'vitest'
import { combatRuleAppliesTo, combatRuleChoices } from '../core/combatRules'
import { bookOf, categories } from './catalogue.fixtures'
import { datasheetAbilitiesIn, datasheetIn } from './catalogue'
import { rosterCombatant } from './rosterCombatRules'
import { rosterDatasheetContext } from './rosterDatasheetContext'

const aura =
  'While a friendly **ARMY** unit (excluding **MONSTER** and **TITANIC** units) is within 6" of this model, each time a model in that unit makes an attack, if that model has the **CULT** keyword or that enemy unit is the closest eligible target, that attack has the [SUSTAINED HITS 1] ability.'
const profile = (id: string, description: string) => ({
  id,
  name: id,
  typeName: 'Abilities',
  characteristics: [{ name: 'Description', $text: description }],
})
const book = bookOf({
  selectionEntries: [
    { id: 'recipient', name: 'Recipient', type: 'model', categoryLinks: categories('Faction: Army', 'Infantry', 'Cult') },
    { id: 'monster', name: 'Monster', type: 'model', categoryLinks: categories('Faction: Army', 'Monster') },
    {
      id: 'source',
      name: 'Source',
      type: 'model',
      categoryLinks: categories('Faction: Army', 'Infantry', 'Cult'),
      profiles: [
        profile('Support', aura),
        profile(
          'Protection',
          'While this model is within 3" of one or more other friendly CULT units, this model has the Lone Operative ability.',
        ),
      ],
    },
  ],
})
const input = { catalogueId: 'cat', detachmentIds: [], picks: [{ entryId: 'recipient' }, { entryId: 'source' }], pickIndex: 0 }

describe('roster support rules', () => {
  it('offers a marked-enemy bonus to its friendly recipient from another roster unit', () => {
    const loaded = bookOf({
      selectionEntries: [
        { id: 'recipient', name: 'Recipient', type: 'model', categoryLinks: categories('Army') },
        {
          id: 'source',
          name: 'Source',
          type: 'model',
          categoryLinks: categories('Army'),
          profiles: [
            profile(
              'Mark',
              'At the start of the Fight phase, select one enemy unit within Engagement Range of this model. Until the end of the phase, each time a friendly ARMY model makes an attack that targets that unit, you can re-roll a Wound roll of 1.',
            ),
          ],
        },
      ],
    })
    expect(rosterCombatant(loaded, null, input)?.rules.flatMap(combatRuleChoices)).toEqual([
      {
        label: 'Selected target within Engagement Range · Against the selected target',
        effects: [{ role: 'attacker', phases: ['melee'], options: { woundReroll: 'ones' } }],
      },
    ])
  })
  const selectionBook = bookOf({
    selectionEntries: [
      { id: 'construct', name: 'Construct', type: 'model', categoryLinks: categories('Army Construct') },
      { id: 'titanic', name: 'Titanic', type: 'model', categoryLinks: categories('Army Construct', 'Titanic') },
      { id: 'other', name: 'Other', type: 'model', categoryLinks: categories('Infantry') },
      {
        id: 'source',
        name: 'Source',
        type: 'model',
        categoryLinks: categories('Infantry'),
        profiles: [
          profile(
            'Selected support',
            'Once per turn, in your Movement phase, when this model starts or ends a move, select one friendly Army Construct unit within 6" of this model (excluding Titanic units) and one enemy unit visible to this model. Until the start of your next Movement phase, weapons equipped by models in that friendly unit have the [Sustained Hits 1] ability while targeting that enemy unit.',
          ),
        ],
      },
    ],
  })
  it('offers calculated selected support only to the eligible recipient', () => {
    const result = rosterCombatant(selectionBook, null, { ...input, picks: [{ entryId: 'construct' }, { entryId: 'source' }] })
    expect(result?.rules.flatMap(combatRuleChoices)).toEqual([
      {
        label: 'Selected within 6" · Against the selected target',
        effects: [{ role: 'attacker', phases: ['ranged', 'melee'], keyword: 'Sustained Hits 1' }],
      },
    ])
  })
  it.each(['titanic', 'other', 'source'])('omits selected support for the ineligible %s recipient', (entryId) => {
    expect(rosterCombatant(selectionBook, null, { ...input, picks: [{ entryId }, { entryId: 'source' }] })?.rules).toEqual([])
  })
  it('omits selected support from an inactive source', () => {
    expect(
      rosterCombatant(selectionBook, null, { ...input, picks: [{ entryId: 'construct' }, { entryId: 'source' }], inactivePicks: [1] })
        ?.rules,
    ).toEqual([])
  })
  it('hides an unsupported candidate through the shared simulator visibility predicate', () => {
    const loaded = bookOf({
      selectionEntries: [
        {
          id: 'recipient',
          name: 'Recipient',
          type: 'model',
          profiles: [
            profile('Ceremonial marksmen', 'Weapons equipped by this unit have the [PRECISION] ability. These warriors are legends.'),
          ],
        },
      ],
    })
    const rule = rosterCombatant(loaded, null, { ...input, picks: [{ entryId: 'recipient' }] })?.rules[0]
    expect(rule).toMatchObject({ name: 'Ceremonial marksmen' })
    expect(rule && combatRuleAppliesTo(rule, 'attacker')).toBe(false)
  })
  it('offers the aura from another active unit with the recipient keywords', () => {
    const rule = rosterCombatant(book, null, input)?.rules.find((candidate) => candidate.name === 'Support')
    expect(rule && combatRuleChoices(rule)[0]?.label).toBe('Within 6"')
  })
  it('excludes support from a destroyed, embarked, or reserve source', () =>
    expect(rosterCombatant(book, null, { ...input, inactivePicks: [1] })?.rules).toEqual([]))
  it('does not grant a source-only defence to a nearby recipient', () =>
    expect(rosterCombatant(book, null, input)?.rules.some((rule) => rule.name === 'Protection')).toBe(false))
  it('excludes explicitly forbidden recipients', () =>
    expect(rosterCombatant(book, null, { ...input, picks: [{ entryId: 'monster' }, { entryId: 'source' }] })?.rules).toEqual([]))
  it('does not assume an invalid pick index selects the first model', () =>
    expect(rosterCombatant(book, null, { ...input, pickIndex: 3 })).toBeNull())
  it('reads the same selected abilities without projecting source weapons', () => {
    const context = rosterDatasheetContext(book, { ...input, pickIndex: 1 })!
    expect(datasheetAbilitiesIn(book, 'cat', 'source', context)?.abilities).toEqual(datasheetIn(book, 'cat', 'source', context)?.abilities)
  })
  it('keeps recipient keywords in the support projection', () => {
    const context = rosterDatasheetContext(book, { ...input, pickIndex: 1 })!
    expect(datasheetAbilitiesIn(book, 'cat', 'source', context)?.keywords).toContain('Cult')
  })
})
