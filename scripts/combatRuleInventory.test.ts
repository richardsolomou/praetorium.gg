import { describe, expect, it } from 'vitest'
import { bookOf } from '../src/server/catalogue.fixtures'
import { combatWeaponKeywordInventory, unselectedCombatRules } from './combatRuleInventory'

describe('combat discovery inventory', () => {
  it('retains shared weapon keywords when filtering their referring faction', () => {
    const loaded = bookOf({
      name: 'Test faction',
      selectionEntries: [{ id: 'weapon', name: 'Optional weapon', infoLinks: [{ id: 'link', targetId: 'profile', type: 'profile' }] }],
      sharedProfiles: [
        { id: 'profile', name: 'Rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'Keywords', $text: 'Sustained Hits D3' }] },
      ],
    })
    expect(combatWeaponKeywordInventory(loaded, 'Test faction').map((row) => row.keyword)).toEqual(['sustained hits d3'])
  })
  it('audits every shared weapon keyword, including unselected variable and unknown abilities', () => {
    const loaded = bookOf({
      sharedProfiles: [
        {
          id: 'weapon',
          name: 'Optional weapon',
          typeName: 'Ranged Weapons',
          characteristics: [{ name: 'Keywords', $text: 'Sustained Hits D3, Rapid Fire D6+3, Unknown ability' }],
        },
      ],
    })
    expect(combatWeaponKeywordInventory(loaded).map(({ keyword, supported }) => ({ keyword, supported }))).toEqual([
      { keyword: 'unknown ability', supported: false },
      { keyword: 'rapid fire d6+3', supported: true },
      { keyword: 'sustained hits d3', supported: true },
    ])
  })
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
