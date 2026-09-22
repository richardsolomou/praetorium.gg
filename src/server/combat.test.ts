import { expect, it } from 'vitest'
import { DEFAULT_COMBAT_OPTIONS, simulateCombat } from '../core/combat'
import { combatPlan } from '../core/combatProfiles'
import { bookOf } from './catalogue.fixtures'
import { datasheetViewsIn } from './catalogue'

it('simulates the evaluated enhancement and preserves its source through the loadout response', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'unit',
        name: 'Model',
        type: 'model',
        selectionEntries: [
          {
            id: 'weapon',
            name: 'Weapon',
            type: 'upgrade',
            profiles: [
              {
                id: 'profile',
                name: 'Weapon',
                typeName: 'Ranged Weapons',
                characteristics: Object.entries({ A: '2', BS: '3+', S: '4', AP: '0', D: '1' }).map(([name, $text]) => ({
                  name,
                  typeId: name,
                  $text,
                })),
              },
            ],
          },
        ],
        entryLinks: [{ id: 'relic-link', targetId: 'relic', type: 'selectionEntry' }],
        modifierGroups: [
          {
            conditions: [
              { type: 'atLeast', value: 1, field: 'selections', scope: 'parent', childId: 'relic', includeChildSelections: true },
            ],
            modifiers: [{ type: 'increment', value: 2, field: 'A', affects: 'self.entries.recursive.profiles.Ranged Weapons' }],
          },
        ],
      },
    ],
    sharedSelectionEntries: [{ id: 'relic', name: 'Relic', type: 'upgrade' }],
  })
  const views = datasheetViewsIn(book, 'cat', 'unit', {
    selections: [{ id: 'unit', selections: [{ id: 'weapon' }, { id: 'relic-link' }] }],
    unitSelectionIndex: 0,
  })
  expect(views.selected?.profiles[0]?.values[0]?.modifiers).toEqual(['Relic'])
  const plan = combatPlan(views.selected!, views.carriers, [], 'ranged')
  expect(plan.errors).toEqual([])
  const result = simulateCombat({
    weapons: plan.weapons,
    options: DEFAULT_COMBAT_OPTIONS,
    target: { models: 1, wounds: 10, toughness: 4, save: 3, invulnerable: null, feelNoPain: null },
  })
  expect(Math.abs(result.meanDamage - 4 * (4 / 6) * (3 / 6) * (2 / 6))).toBeLessThan(0.02)
})
