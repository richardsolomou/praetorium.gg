import { expect, it } from 'vitest'
import { DEFAULT_COMBAT_OPTIONS, calculateCombat } from '../core/combat'
import { combatPlan } from '../core/combatProfiles'
import { bookOf } from './catalogue.fixtures'
import { datasheetViewsIn } from './catalogue'

const weaponProfile = (id: string, name: string, typeName = 'Ranged Weapons') => ({
  id,
  name,
  typeName,
  characteristics: Object.entries({ A: '2', [typeName === 'Ranged Weapons' ? 'BS' : 'WS']: '3+', S: '4', AP: '0', D: '1' }).map(
    ([characteristicName, $text]) => ({ name: characteristicName, typeId: characteristicName, $text }),
  ),
})

it('uses equipped profile identities for misspelled names and bundled weapons', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'unit',
        name: 'Squad',
        type: 'unit',
        selectionEntries: [
          {
            id: 'model',
            name: 'Trooper',
            type: 'model',
            selectionEntries: [
              {
                id: 'bundle',
                name: 'Rifle and blade',
                type: 'upgrade',
                profiles: [weaponProfile('rifle', 'Different rifle'), weaponProfile('blade', 'Different blade', 'Melee Weapons')],
              },
            ],
          },
        ],
      },
    ],
  })
  const views = datasheetViewsIn(book, 'cat', 'unit', {
    selections: [{ id: 'unit', selections: [{ id: 'model', count: 3, selections: [{ id: 'bundle' }] }] }],
    unitSelectionIndex: 0,
  })
  expect(
    ['ranged', 'melee'].map((phase) => {
      const plan = combatPlan(views.selected!, views.carriers, [], phase as 'ranged' | 'melee')
      return { errors: plan.errors, counts: plan.weapons.map((weapon) => weapon.count) }
    }),
  ).toEqual([
    { errors: [], counts: [3] },
    { errors: [], counts: [3] },
  ])
})

it('includes unit-level shooting equipment without inventing its bearer', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'unit',
        name: 'Squad',
        type: 'unit',
        selectionEntries: [
          { id: 'leader', name: 'Leader', type: 'model' },
          { id: 'trooper', name: 'Trooper', type: 'model' },
          { id: 'grenade', name: 'Grenade', type: 'upgrade', profiles: [weaponProfile('grenade-profile', 'Grenade')] },
        ],
      },
    ],
  })
  const views = datasheetViewsIn(book, 'cat', 'unit', {
    selections: [{ id: 'unit', selections: [{ id: 'leader' }, { id: 'trooper', count: 4 }, { id: 'grenade' }] }],
    unitSelectionIndex: 0,
  })
  const plan = combatPlan(views.selected!, views.carriers, [], 'ranged')
  expect({
    models: views.carriers.reduce((sum, carrier) => sum + carrier.models, 0),
    errors: plan.errors,
    counts: plan.weapons.map((weapon) => weapon.count),
  }).toEqual({ models: 5, errors: [], counts: [1] })
})

it('counts intrinsic weapons per model and excludes explicitly reference-only profiles from equipped views', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'unit',
        name: 'Squad',
        type: 'unit',
        profiles: [
          weaponProfile('blade', 'Blade', 'Melee Weapons'),
          weaponProfile('reference', 'Other blade (ref. only)', 'Melee Weapons'),
        ],
        selectionEntries: [{ id: 'model', name: 'Trooper', type: 'model' }],
      },
    ],
  })
  const views = datasheetViewsIn(book, 'cat', 'unit', {
    selections: [{ id: 'unit', selections: [{ id: 'model', count: 3 }] }],
    unitSelectionIndex: 0,
  })
  const plan = combatPlan(views.selected!, views.carriers, [], 'melee')
  expect({
    errors: plan.errors,
    weapons: plan.used.map(({ profile, count }) => [profile.name, count]),
    referenceAvailable: views.available?.profiles.some((profile) => profile.id === 'reference'),
  }).toEqual({ errors: [], weapons: [['Blade', 3]], referenceAvailable: true })
})

it('resolves linked weapon profiles and keeps their alternate modes exclusive', () => {
  const book = bookOf({
    selectionEntries: [
      {
        id: 'unit',
        name: 'Model',
        type: 'model',
        selectionEntries: [
          {
            id: 'equipment',
            name: 'Equipment label',
            type: 'upgrade',
            infoLinks: [
              { id: 'strike-link', targetId: 'strike', type: 'profile' },
              { id: 'sweep-link', targetId: 'sweep', type: 'profile' },
            ],
          },
        ],
      },
    ],
    sharedProfiles: [weaponProfile('strike', 'Claws- strike', 'Melee Weapons'), weaponProfile('sweep', 'Claws- sweep', 'Melee Weapons')],
  })
  const views = datasheetViewsIn(book, 'cat', 'unit', {
    selections: [{ id: 'unit', selections: [{ id: 'equipment' }] }],
    unitSelectionIndex: 0,
  })
  const plan = combatPlan(views.selected!, views.carriers, [], 'melee', { 'melee:0:equipment label': 'sweep' })
  expect({ errors: plan.errors, profiles: plan.used.map((entry) => entry.profile.id) }).toEqual({ errors: [], profiles: ['sweep'] })
})

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
  const result = calculateCombat({
    weapons: plan.weapons,
    options: DEFAULT_COMBAT_OPTIONS,
    target: { groups: [{ models: 1, wounds: 10, toughness: 4, save: 3, invulnerable: null }], feelNoPain: null },
  })
  expect(result.meanDamage).toBeCloseTo(4 * (4 / 6) * (3 / 6) * (2 / 6), 12)
})
