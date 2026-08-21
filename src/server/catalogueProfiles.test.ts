import { describe, expect, it } from 'vitest'
import { datasheetIn } from './catalogue'
import { bookOf, profileOperationCases } from './catalogue.fixtures'

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
})
