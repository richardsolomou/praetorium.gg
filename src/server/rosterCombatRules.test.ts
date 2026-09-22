import { describe, expect, it } from 'vitest'
import { combatRuleChoices } from '../core/combatRules'
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
