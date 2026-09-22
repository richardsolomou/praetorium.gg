import { describe, expect, it } from 'vitest'
import { bookOf } from '../src/server/catalogue.fixtures'
import { unselectedCombatRules } from './combatRuleInventory'

describe('combat discovery inventory', () => {
  it('includes hidden, unselected upgrades rather than only default loadouts', () => {
    const loaded = bookOf({
      selectionEntries: [
        {
          id: 'upgrade',
          type: 'upgrade',
          hidden: true,
          name: 'Optional equipment',
          profiles: [
            {
              id: 'ability',
              name: 'Protection',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'Improve the save.' }],
            },
          ],
        },
      ],
    })
    expect(unselectedCombatRules(loaded).map((row) => row.name)).toContain('Protection')
  })
  it('follows shared ability groups and terminates cyclic links', () => {
    const loaded = bookOf({
      selectionEntries: [{ id: 'unit', type: 'model', name: 'Model', infoLinks: [{ id: 'link', targetId: 'group', type: 'infoGroup' }] }],
      sharedInfoGroups: [
        {
          id: 'group',
          profiles: [
            {
              id: 'ability',
              name: 'Aura',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'Improve friendly attacks.' }],
            },
          ],
          infoLinks: [{ id: 'cycle', targetId: 'group', type: 'infoGroup' }],
        },
      ],
    })
    expect(unselectedCombatRules(loaded).filter((row) => row.name === 'Aura')).toHaveLength(1)
  })
  it('does not treat weapon statistics as ability descriptions', () => {
    const loaded = bookOf({
      sharedRules: [{ id: 'rule', name: 'Core rule', description: 'A rule.' }],
      selectionEntries: [
        {
          id: 'weapon',
          type: 'upgrade',
          profiles: [
            {
              id: 'profile',
              name: 'Rifle',
              typeName: 'Ranged Weapons',
              characteristics: [{ name: 'Description', $text: 'Weapon description.' }],
            },
          ],
        },
      ],
    })
    expect(unselectedCombatRules(loaded).map((row) => row.name)).toEqual(['Core rule'])
  })
})
