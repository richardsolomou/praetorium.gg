import { describe, expect, it } from 'vitest'
import { datasheetIn, datasheetViewsIn, woundsOf } from './catalogue'
import { bookOf, categories, shelfOf } from './catalogue.fixtures'

describe('a datasheet', () => {
  it('links an imported chapter relationship to the canonical Space Marines reference', () => {
    const book = shelfOf(
      {
        name: 'Space Marines',
        selectionEntries: [
          { id: 'eradicators', name: 'Eradicator Squad', type: 'unit', categoryLinks: categories('Faction: Adeptus Astartes') },
        ],
      },
      {
        name: 'Salamanders',
        selectionEntries: [
          {
            id: 'vulkan',
            name: "Vulkan He'stan",
            type: 'model',
            categoryLinks: categories('Faction: Salamanders'),
            infoGroups: [
              {
                id: 'leader',
                name: 'Leader',
                profiles: [
                  {
                    id: 'leader-profile',
                    name: 'Leader',
                    characteristics: [
                      {
                        name: 'Description',
                        $text: 'This model can be attached to the following units:\n■ ERADICATOR SQUAD',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        catalogueLinks: [{ targetId: 'cat', importRootEntries: true }],
      },
    )

    expect(datasheetIn(book, 'cat-1', 'vulkan')?.attachments).toEqual([
      {
        kind: 'leader',
        name: 'Eradicator Squad',
        entryId: 'eradicators',
        route: { catalogueId: 'space-marines', slug: 'eradicator-squad' },
      },
    ])
    expect(datasheetIn(book, 'cat-1', 'eradicators')?.referenceRoute).toEqual({
      catalogueId: 'space-marines',
      slug: 'eradicator-squad',
    })
  })

  it('collects model, weapon, ability and keyword display data', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          categoryLinks: categories('Infantry', 'Battleline'),
          profiles: [{ id: 'unit', name: 'Squad', typeName: 'Unit', characteristics: [{ name: 'T', $text: '4' }] }],
          selectionEntries: [
            {
              id: 'gun',
              name: 'Rifle',
              type: 'upgrade',
              profiles: [{ id: 'weapon', name: 'Rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'A', $text: '2' }] }],
            },
          ],
        },
      ],
    })
    expect(datasheetIn(book, 'cat', 'squad')).toMatchObject({
      name: 'Squad',
      points: 0,
      keywords: ['Battleline', 'Infantry'],
      profiles: [
        { name: 'Squad', type: 'Unit', values: [{ name: 'T', value: '4' }] },
        { name: 'Rifle', type: 'Ranged Weapons', values: [{ name: 'A', value: '2' }] },
      ],
    })
  })

  it('prints a keyword the list grants, and not one the data keeps for its own bookkeeping', () => {
    const book = bookOf({
      categoryEntries: [
        { id: 'deathwing', name: 'Deathwing' },
        { id: 'marker', name: 'Damage Dx Weapon', hidden: true },
      ],
      selectionEntries: [
        {
          id: 'chaplain',
          name: 'Chaplain in Terminator Armour',
          type: 'model',
          categoryLinks: [{ id: 'link', targetId: 'character', name: 'Character' }],
          modifiers: [
            { type: 'add', field: 'category', value: 'deathwing' },
            { type: 'add', field: 'category', value: 'marker' },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'chaplain')?.keywords).toEqual(['Character', 'Deathwing'])
  })

  it('leaves out a bookkeeping keyword the datasheet writes for itself', () => {
    // The marker is on the datasheet rather than granted to it, and the attachment
    // markers the game system writes are the same shape. Reading the link instead of
    // the category it points at printed Leader on 718 datasheets.
    const book = bookOf({
      categoryEntries: [
        { id: 'infantry', name: 'Infantry' },
        { id: 'marker', name: 'Leader', hidden: true },
      ],
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'model',
          categoryLinks: [
            { id: 'first', targetId: 'infantry', name: 'Infantry' },
            { id: 'second', targetId: 'marker', name: 'Leader' },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'captain')?.keywords).toEqual(['Infantry'])
  })

  it('shows duplicate available profiles once', () => {
    const profile = (id: string, name = 'Storm bolter') => ({
      id,
      name,
      typeName: 'Ranged Weapons',
      characteristics: [{ name: 'A', $text: '2' }],
    })
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            { id: 'first-bolter', name: 'Storm bolter', type: 'upgrade', profiles: [profile('first-profile')] },
            { id: 'second-bolter', name: 'Storm Bolter', type: 'upgrade', profiles: [profile('second-profile', 'Storm Bolter')] },
          ],
        },
      ],
    })

    expect(datasheetIn(book, 'cat', 'squad')?.profiles.map(({ name }) => name)).toEqual(['Storm bolter'])
  })

  it('shows only weapons carried by the selected unit when roster context is present', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'unit',
          selectionEntries: [
            {
              id: 'blade-entry',
              name: 'Blade',
              type: 'upgrade',
              profiles: [{ id: 'blade', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '5' }] }],
            },
            {
              id: 'spear-entry',
              name: 'Spear',
              type: 'upgrade',
              profiles: [{ id: 'spear', name: 'Spear', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '6' }] }],
            },
          ],
        },
      ],
    })
    const context = { selections: [{ id: 'captain', selections: [{ id: 'blade-entry', count: 1 }] }], unitSelectionIndex: 0 }
    expect(datasheetIn(book, 'cat', 'captain', context)?.profiles.map((profile) => profile.name)).toEqual(['Blade'])
  })

  it('uses the carried wargear quantity for weapon profiles', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          selectionEntries: [
            {
              id: 'models',
              name: 'Troopers',
              type: 'model',
              selectionEntries: [
                {
                  id: 'rifle-entry',
                  name: 'Bolt rifle',
                  type: 'upgrade',
                  profiles: [{ id: 'rifle', name: 'Bolt rifle', typeName: 'Ranged Weapons', characteristics: [{ name: 'A', $text: '2' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    const context = {
      selections: [{ id: 'squad', selections: [{ id: 'models', count: 4, selections: [{ id: 'rifle-entry', count: 1 }] }] }],
      unitSelectionIndex: 0,
    }

    expect(datasheetIn(book, 'cat', 'squad', context)?.profiles).toMatchObject([{ name: 'Bolt rifle', count: 4 }])
  })

  /**
   * A character attached to a bodyguard unit is one unit with it, so a relic that
   * speaks of "models in the bearer's unit" reaches the models it has joined. What
   * the bearer's own weapons do stays with the bearer, and the data draws the
   * difference itself: the whole-unit modifier says `group` and the other does not.
   */
  it('carries a whole-unit enhancement across to the unit a character leads', () => {
    const profiles = (id: string) => [
      { id: `${id}-unit`, name: id, typeName: 'Unit', characteristics: [{ name: 'M', typeId: 'unit-move', $text: '5"' }] },
      {
        id: `${id}-blade`,
        name: 'Blade',
        typeName: 'Melee Weapons',
        characteristics: [{ name: 'A', typeId: 'melee-attacks', $text: '4' }],
      },
    ]
    const book = bookOf({
      selectionEntries: [
        {
          id: 'overlord',
          name: 'Overlord',
          type: 'model',
          profiles: profiles('overlord'),
          selectionEntryGroups: [
            {
              id: 'enhancements',
              name: 'Enhancements',
              selectionEntries: [
                {
                  id: 'ankh',
                  name: 'Destroyer Ankh',
                  type: 'upgrade',
                  modifiers: [
                    { type: 'increment' as const, value: 2, field: 'unit-move', affects: 'self.entries.group.recursive.profiles.Unit' },
                    {
                      type: 'increment' as const,
                      value: 2,
                      field: 'melee-attacks',
                      affects: 'self.entries.recursive.profiles.Melee Weapons',
                    },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'squad', name: 'Squad', type: 'unit', profiles: profiles('squad') },
      ],
    })
    const selections = [{ id: 'overlord', selections: [{ id: 'ankh' }] }, { id: 'squad' }]
    const values = (entryId: string, unitSelectionIndex: number, companions: number[]) =>
      datasheetIn(book, 'cat', entryId, { selections, unitSelectionIndex, companions })?.profiles.map((profile) => ({
        name: profile.name,
        values: profile.values.map((value) => `${value.name} ${value.value}`),
      }))

    // The Move reaches the models the bearer has joined; what the bearer's own blade
    // does is the bearer's alone.
    expect(values('squad', 1, [0])).toEqual([
      { name: 'squad', values: ['M 7"'] },
      { name: 'Blade', values: ['A 4'] },
    ])
    // And without the attachment it stays where it is.
    expect(values('squad', 1, [])).toEqual([
      { name: 'squad', values: ['M 5"'] },
      { name: 'Blade', values: ['A 4'] },
    ])
  })

  /**
   * The real catalogue does not nest an enhancement directly under its bearer: every
   * eligible datasheet links to one shared library of enhancement options, and
   * picking one persists that link as an intermediate selection (`expand` in
   * roster.ts builds exactly this shape). A `parent`-scoped modifier reached through
   * that link previously resolved to the library link itself rather than the
   * bearer, so it matched nothing on the bearer's own profiles and only worked by
   * accident once attached to a unit whose own profiles could never be its lineage.
   */
  it('reaches the bearer through a library of enhancements linked by reference', () => {
    const profiles = (id: string) => [
      {
        id: `${id}-ranged`,
        name: 'Gauss weapon',
        typeName: 'Ranged Weapons',
        characteristics: [{ name: 'Range', typeId: 'range', $text: '18"' }],
      },
    ]
    const book = bookOf({
      sharedSelectionEntryGroups: [
        {
          id: 'enhancements',
          name: 'Enhancements',
          selectionEntries: [
            {
              id: 'gauntlet',
              name: 'Gauntlet of Compression',
              type: 'upgrade',
              modifiers: [
                {
                  type: 'increment' as const,
                  value: 6,
                  field: 'range',
                  scope: 'parent',
                  affects: 'self.entries.group.recursive.profiles.Ranged Weapons',
                },
              ],
            },
          ],
        },
      ],
      selectionEntries: [
        {
          id: 'cryptek',
          name: 'Cryptek',
          type: 'model',
          profiles: profiles('cryptek'),
          entryLinks: [{ id: 'cryptek-enhancements', name: 'Enhancements', targetId: 'enhancements', type: 'selectionEntryGroup' }],
        },
        { id: 'squad', name: 'Squad', type: 'unit', profiles: profiles('squad') },
      ],
    })
    const selections = [{ id: 'cryptek', selections: [{ id: 'cryptek-enhancements', selections: [{ id: 'gauntlet' }] }] }, { id: 'squad' }]
    const values = (entryId: string, unitSelectionIndex: number, companions: number[]) =>
      datasheetIn(book, 'cat', entryId, { selections, unitSelectionIndex, companions })?.profiles.map((profile) => ({
        name: profile.name,
        values: profile.values.map((value) => `${value.name} ${value.value}`),
      }))

    expect(values('cryptek', 0, [])).toEqual([{ name: 'Gauss weapon', values: ['Range 24"'] }])
    expect(values('squad', 1, [0])).toEqual([{ name: 'Gauss weapon', values: ['Range 24"'] }])
  })

  it('keeps every weapon when the loadout asks for the ones not carried', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'captain',
          name: 'Captain',
          type: 'unit',
          selectionEntries: [
            {
              id: 'blade-entry',
              name: 'Blade',
              type: 'upgrade',
              profiles: [{ id: 'blade', name: 'Blade', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '5' }] }],
            },
            {
              id: 'spear-entry',
              name: 'Spear',
              type: 'upgrade',
              profiles: [{ id: 'spear', name: 'Spear', typeName: 'Melee Weapons', characteristics: [{ name: 'S', $text: '6' }] }],
            },
          ],
        },
      ],
    })
    const context = { selections: [{ id: 'captain', selections: [{ id: 'blade-entry', count: 1 }] }], unitSelectionIndex: 0 }
    const views = datasheetViewsIn(book, 'cat', 'captain', context)
    expect(views.selected?.profiles.map((profile) => profile.name)).toEqual(['Blade'])
    expect(views.available?.profiles.map((profile) => profile.name)).toEqual(['Blade', 'Spear'])
    expect(datasheetIn(book, 'cat', 'captain', { ...context, everyWeapon: true })?.profiles.map((profile) => profile.name)).toEqual([
      'Blade',
      'Spear',
    ])
  })

  /**
   * An enhancement belongs to the unit that bears it. Every datasheet that may take
   * one carries the same condition, naming the same shared entry, and a datasheet
   * sits directly in the force — so reading the force there had each of them ask
   * whether the *army* held the relic, and one character's ankh sharpened another
   * character's blade.
   */
  it('keeps an enhancement on the unit that bears it', () => {
    const sheet = (id: string, name: string) => ({
      id,
      name,
      type: 'model' as const,
      selectionEntries: [
        {
          id: `${id}-blade`,
          name: 'Blade',
          type: 'upgrade' as const,
          profiles: [
            {
              id: `${id}-blade-profile`,
              name: 'Blade',
              typeName: 'Melee Weapons',
              characteristics: [{ name: 'S', typeId: 'melee-strength', $text: '8' }],
            },
          ],
        },
      ],
      entryLinks: [{ id: `${id}-ankh`, name: 'Destroyer Ankh', targetId: 'ankh', type: 'selectionEntry' as const }],
      modifierGroups: [
        {
          conditions: [
            { type: 'atLeast' as const, value: 1, field: 'selections', scope: 'parent', childId: 'ankh', includeChildSelections: true },
          ],
          modifiers: [
            { type: 'increment' as const, value: 2, field: 'melee-strength', affects: 'self.entries.recursive.profiles.Melee Weapons' },
          ],
        },
      ],
    })
    const book = bookOf({
      selectionEntries: [sheet('overlord', 'Overlord'), sheet('lord', 'Lord')],
      sharedSelectionEntries: [{ id: 'ankh', name: 'Destroyer Ankh', type: 'upgrade' }],
    })
    const selections = [
      { id: 'overlord', selections: [{ id: 'overlord-blade' }, { id: 'overlord-ankh' }] },
      { id: 'lord', selections: [{ id: 'lord-blade' }] },
    ]

    const bearer = datasheetIn(book, 'cat', 'overlord', { selections, unitSelectionIndex: 0 })
    expect(bearer?.profiles[0]?.values[0]).toEqual({ name: 'S', value: '10', baseValue: '8', modifiers: ['Destroyer Ankh'] })
    const other = datasheetIn(book, 'cat', 'lord', { selections, unitSelectionIndex: 1 })
    expect(other?.profiles[0]?.values[0]).toEqual({ name: 'S', value: '8' })
  })
})

describe('the wounds one model of a datasheet takes', () => {
  const profile = (type: string, ...wounds: string[]) => ({
    type,
    values: wounds.map((value) => ({ name: 'W', value })),
  })

  it('is read off the unit profile', () => {
    expect(woundsOf([profile('Unit', '12')])).toBe(12)
  })

  it('is read whatever case the book writes the profile type in', () => {
    expect(woundsOf([{ type: 'unit', values: [{ name: 'Wounds', value: '4' }] }])).toBe(4)
  })

  it('is the shared number when several kinds of model agree on it', () => {
    expect(woundsOf([profile('Unit', '3'), profile('Unit', '3')])).toBe(3)
  })

  it('is unknown when the kinds of model disagree', () => {
    // A sergeant standing with his veterans. A unit is one row here, so naming either
    // number would be wrong for the rest of the squad.
    expect(woundsOf([profile('Unit', '4'), profile('Unit', '3')])).toBeNull()
  })

  it('is unknown when nothing states it', () => {
    expect(woundsOf([{ type: 'Unit', values: [{ name: 'T', value: '5' }] }])).toBeNull()
  })

  it('ignores a weapon profile that happens to carry the same letter', () => {
    expect(woundsOf([profile('Ranged Weapons', '2'), profile('Unit', '6')])).toBe(6)
  })
})
