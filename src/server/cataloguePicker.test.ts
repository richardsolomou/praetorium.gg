import { describe, expect, it } from 'vitest'
import { datasheetInBySlug } from '../shared/catalogue'
import { calculateRosterPrice } from '../shared/pricing'
import { pickerConstruction, pickerUnitsFor } from '../shared/pickerUnits'
import { groupOfEntry, unitIdsIn, unitsIn } from '../shared/cataloguePicker'
import { ability, bookOf, categories, offered, points, shelfOf, withCards } from './catalogue.fixtures'

describe('the shelf a datasheet is filed under', () => {
  const shelfOfTitan = (links: { id: string; targetId: string; name: string; primary?: boolean }[]) =>
    groupOfEntry(
      bookOf({
        selectionEntries: [{ id: 'titan', name: 'Reaver Titan', type: 'model', categoryLinks: links }],
      }).index,
      'titan',
    )

  it('is the primary category that names a shelf, not merely the first one', () => {
    // A Reaver Titan prints two: the allied-detachment counter comes first, and
    // reading only that filed 52 Titans and an allied kill team under Other.
    expect(
      shelfOfTitan([
        { id: 'a', targetId: 'allies', name: 'Allies: Titanicus Traitoris', primary: true },
        { id: 'b', targetId: 'vehicle', name: 'Vehicle', primary: true },
      ]),
    ).toBe('vehicle')
  })

  it('stays Other when no primary category names a shelf', () => {
    // A secondary keyword does not get to stand in for one.
    expect(
      shelfOfTitan([
        { id: 'a', targetId: 'allies', name: 'Allies: Titanicus Traitoris', primary: true },
        { id: 'b', targetId: 'walker', name: 'Walker' },
      ]),
    ).toBe('other')
  })

  it('uses the strongest secondary category for a generated root link', () => {
    const index = bookOf({
      selectionEntries: [
        {
          id: 'profile-unit-character',
          name: 'Captain',
          type: 'model',
          categoryLinks: [
            { id: 'faction', targetId: 'faction', name: 'Faction: Adeptus Astartes', primary: true },
            { id: 'infantry', targetId: 'infantry', name: 'Infantry' },
            { id: 'character', targetId: 'character', name: 'Character' },
          ],
        },
      ],
    }).index
    expect(groupOfEntry(index, 'profile-unit-character')).toBe('character')
  })
})

describe('the picker', () => {
  it('lists every unit when a request reads a list the background build has started', () => {
    const book = () =>
      bookOf({
        selectionEntries: [
          { id: 'warriors', name: 'Necron Warriors', type: 'unit', costs: points(100) },
          { id: 'immortals', name: 'Immortals', type: 'unit', costs: points(70) },
        ],
      })
    const started = book()
    const construction = pickerConstruction(started, null, 'cat')
    construction.next()
    construction.next()
    expect(pickerUnitsFor(started, null, 'cat', '')).toEqual(pickerUnitsFor(book(), null, 'cat', ''))
  })

  it('finds datasheets by keyword, ability, weapon and weapon keyword', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'cryptek', name: 'Cryptek' }],
      selectionEntries: [
        {
          id: 'technomancer',
          name: 'Technomancer',
          type: 'model',
          costs: points(85),
          categoryLinks: [{ id: 'cryptek-link', targetId: 'cryptek', name: 'Cryptek' }],
          profiles: [
            {
              id: 'staff',
              name: 'Staff of light',
              typeName: 'Ranged Weapons',
              characteristics: [{ name: 'Keywords', $text: 'Assault, Lethal Hits' }],
            },
            {
              id: 'reanimation',
              name: 'Rites of Reanimation',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'Restore one model.' }],
            },
          ],
          selectionEntryGroups: [
            {
              id: 'wargear',
              name: 'Wargear',
              constraints: [{ id: 'wargear-max', type: 'max', scope: 'parent', field: 'selections', value: 1 }],
              selectionEntries: [{ id: 'cloak', name: 'Canoptek cloak', type: 'upgrade' }],
            },
          ],
        },
        { id: 'warriors', name: 'Necron Warriors', type: 'unit', costs: points(100) },
      ],
    })

    expect(unitsIn(book, 'cat', 'cryptek')).toEqual([
      expect.objectContaining({ name: 'Technomancer', matchReasons: [{ kind: 'keyword', value: 'Cryptek' }] }),
    ])
    expect(unitsIn(book, 'cat', 'reanimation')).toEqual([
      expect.objectContaining({ name: 'Technomancer', matchReasons: [{ kind: 'ability', value: 'Rites of Reanimation' }] }),
    ])
    expect(unitsIn(book, 'cat', 'staff')).toEqual([
      expect.objectContaining({ name: 'Technomancer', matchReasons: [{ kind: 'weapon', value: 'Staff of light' }] }),
    ])
    expect(unitsIn(book, 'cat', 'lethal')).toEqual([
      expect.objectContaining({ name: 'Technomancer', matchReasons: [{ kind: 'weapon keyword', value: 'Lethal Hits' }] }),
    ])
    expect(unitsIn(book, 'cat', 'cloak')).toEqual([
      expect.objectContaining({ name: 'Technomancer', matchReasons: [{ kind: 'wargear', value: 'Canoptek cloak' }] }),
    ])
  })

  it('ranks a datasheet name ahead of a keyword match', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'named', name: 'Cryptek Conclave', type: 'unit', costs: points(100) },
        {
          id: 'keyword',
          name: 'Technomancer',
          type: 'model',
          costs: points(85),
          categoryLinks: [{ id: 'cryptek-link', targetId: 'cryptek', name: 'Cryptek' }],
        },
      ],
    })

    expect(unitsIn(book, 'cat', 'cryptek').map((unit) => unit.name)).toEqual(['Cryptek Conclave', 'Technomancer'])
  })

  it('indexes unit ability prose while excluding hidden fields and conditional shared groups', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'marker', name: 'Secret marker', hidden: true }],
      sharedInfoGroups: [{ id: 'conditional', name: 'Conditional', profiles: [ability('null-aegis', 'Null Aegis')] }],
      selectionEntries: [
        {
          id: 'technomancer',
          name: 'Technomancer',
          type: 'model',
          costs: points(85),
          categoryLinks: [{ id: 'marker-link', targetId: 'marker', name: 'Secret marker' }],
          infoLinks: [{ id: 'conditional-link', targetId: 'conditional', name: 'Conditional', type: 'infoGroup' }],
          profiles: [
            {
              id: 'hidden-gun',
              name: 'Hidden gun',
              typeName: 'Ranged Weapons',
              hidden: true,
            },
            {
              id: 'reanimation',
              name: 'Rites of Reanimation',
              typeName: 'Abilities',
              characteristics: [{ name: 'Description', $text: 'Restore one destroyed model.' }],
            },
          ],
        },
      ],
    })

    expect(unitsIn(book, 'cat', 'secret')).toEqual([])
    expect(unitsIn(book, 'cat', 'hidden gun')).toEqual([])
    expect(unitsIn(book, 'cat', 'null aegis')).toEqual([])
    expect(unitsIn(book, 'cat', 'destroyed').map((unit) => unit.matchReasons)).toEqual([
      [{ kind: 'ability', value: 'Rites of Reanimation' }],
    ])
  })

  it('indexes a hidden link’s rendered profile, and not an ability the unit only has when taken', () => {
    const book = bookOf({
      sharedProfiles: [ability('shared-deceit', 'Shared Deceit')],
      selectionEntries: [
        {
          id: 'deceiver',
          name: "C'tan Shard of the Deceiver",
          type: 'model',
          infoLinks: [{ id: 'hidden-link', targetId: 'shared-deceit', name: 'Shared Deceit', type: 'profile', hidden: true }],
          selectionEntryGroups: [
            {
              id: 'hidden-group',
              name: 'Hidden group',
              hidden: true,
              profiles: [ability('deceit', 'Lord of Deceit')],
            },
          ],
        },
      ],
    })

    expect(unitsIn(book, 'cat', 'lord of deceit')).toEqual([])
    expect(unitsIn(book, 'cat', 'shared deceit')).toEqual([
      expect.objectContaining({ name: "C'tan Shard of the Deceiver", matchReasons: [{ kind: 'ability', value: 'Shared Deceit' }] }),
    ])
  })

  it('keeps offered datasheets whose visibility depends on force context', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'daemon',
          name: 'Bloodletter',
          type: 'model',
          profiles: [ability('deep-strike', 'Deep Strike')],
          modifiers: [
            {
              type: 'set',
              field: 'hidden',
              value: true,
              conditions: [{ type: 'lessThan', value: 1, field: 'selections', scope: 'force', childId: 'show-daemons' }],
            },
          ],
        },
      ],
    })

    expect(unitsIn(book, 'cat', 'deep strike')).toEqual([
      expect.objectContaining({ name: 'Bloodletter', matchReasons: [{ kind: 'ability', value: 'Deep Strike' }] }),
    ])
  })

  it('searches the effective keywords granted in this catalogue', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'deathwing', name: 'Deathwing' }],
      selectionEntries: [
        {
          id: 'chaplain',
          name: 'Chaplain in Terminator Armour',
          type: 'model',
          costs: points(75),
          modifiers: [{ type: 'add', field: 'category', value: 'deathwing' }],
        },
      ],
    })

    expect(unitsIn(book, 'cat', 'deathwing')).toEqual([
      expect.objectContaining({ name: 'Chaplain in Terminator Armour', matchReasons: [{ kind: 'keyword', value: 'Deathwing' }] }),
    ])
  })
  it('offers only eligible KOTC datasheets with the format copy limits', () => {
    const profile = (id: string, toughness: number) => [
      { id: `${id}-profile`, name: id, typeName: 'Unit', characteristics: [{ name: 'T', $text: String(toughness) }] },
    ]
    const book = bookOf({
      selectionEntries: [
        {
          id: 'hero',
          name: 'Named Hero',
          type: 'model',
          costs: points(100),
          categoryLinks: categories('Character', 'Epic Hero'),
          profiles: profile('hero', 4),
        },
        {
          id: 'tank',
          name: 'Heavy Tank',
          type: 'unit',
          costs: points(150),
          categoryLinks: categories('Vehicle'),
          profiles: profile('tank', 10),
        },
        {
          id: 'troops',
          name: 'Line Troops',
          type: 'unit',
          costs: points(80),
          categoryLinks: categories('Infantry', 'Battleline'),
          profiles: profile('troops', 4),
        },
        {
          id: 'transport',
          name: 'Troop Carrier',
          type: 'unit',
          costs: points(90),
          categoryLinks: categories('Vehicle', 'Dedicated Transport'),
          profiles: profile('transport', 8),
        },
        {
          id: 'scouts',
          name: 'Scouts',
          type: 'unit',
          costs: points(70),
          categoryLinks: categories('Infantry'),
          profiles: profile('scouts', 4),
        },
      ],
    })

    expect(Object.fromEntries(unitsIn(book, 'cat', '', { battleSize: 600 }).map((unit) => [unit.name, unit.limit]))).toEqual({
      'Line Troops': 2,
      Scouts: 1,
      'Troop Carrier': 2,
    })
    // A roster's unit limits list exactly what its picker lists, without pricing any of it.
    expect(unitIdsIn(book, 'cat', { battleSize: 600 })).toEqual(unitsIn(book, 'cat', '', { battleSize: 600 }).map((unit) => unit.id))

    // A waived restriction puts the datasheets it was hiding back in the book, and
    // the caps it was imposing back to whatever the catalogue itself says.
    expect(
      Object.fromEntries(
        unitsIn(book, 'cat', '', {
          battleSize: 600,
          waivedRules: ['kotc-epic-heroes', 'kotc-toughness', 'kotc-datasheet-copies'],
        }).map((unit) => [unit.name, unit.limit]),
      ),
    ).toEqual({
      'Heavy Tank': null,
      'Line Troops': null,
      'Named Hero': null,
      Scouts: null,
      'Troop Carrier': null,
    })
  })

  it('counts a datasheet against the cap for the battle size being built', () => {
    // The data writes the largest game's cap on the datasheet and lowers it with a
    // modifier, so a picker that never says which game this is offers a Strike Force
    // list at Incursion.
    const book = bookOf({
      selectionEntries: [
        {
          id: 'lord',
          name: 'Warlord',
          type: 'model',
          costs: points(100),
          constraints: [{ id: 'lord-max', type: 'max', value: 3, field: 'selections', scope: 'force', includeChildSelections: true }],
          modifiers: [
            {
              type: 'set',
              field: 'lord-max',
              value: 2,
              conditions: [{ type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'incursion', shared: true }],
            },
          ],
        },
      ],
    })
    const limitAt = (battleSize?: number) => unitsIn(book, 'cat', '', { battleSize })[0]?.limit

    expect([limitAt(1_000), limitAt(2_000), limitAt()]).toEqual([2, 3, 3])
  })

  it('gives datasheets readable unambiguous route slugs', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'first-sheet', name: 'Royal Warden', type: 'unit', costs: points(40) },
        { id: 'second-sheet', name: 'Royal Warden', type: 'unit', costs: points(45) },
      ],
    })

    const units = unitsIn(book, 'cat', '')
    expect(units.map((unit) => unit.slug)).toEqual(['royal-warden-first-sh', 'royal-warden-second-s'])
    expect(datasheetInBySlug(book, 'cat', units[0]?.slug ?? '')?.id).toBe('first-sheet')
  })

  describe('a datasheet imported beside a same-named one of its own', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'own-master', name: 'Watch Master', type: 'model', costs: points(100) }],
        catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
      },
      { selectionEntries: [{ id: 'agents-master', name: 'Watch Master', type: 'model', costs: points(105) }] },
    )

    it('keeps the page its unsuffixed slug', () => {
      expect(unitsIn(shelf, 'cat', '').find((unit) => unit.id === 'own-master')?.slug).toBe('watch-master')
    })

    it('still opens the page from its suffixed slug', () => {
      expect(datasheetInBySlug(shelf, 'cat', 'watch-master-own-mast')?.id).toBe('own-master')
    })

    it('opens no page from the imported copy’s slug', () => {
      expect(datasheetInBySlug(shelf, 'cat', 'watch-master-agents-m')).toBeNull()
    })
  })

  it('keeps generic Adeptus Astartes datasheets off chapter reference pages', () => {
    const shelf = shelfOf(
      {
        name: 'Imperium - Adeptus Astartes - Space Marines',
        selectionEntries: [
          {
            id: 'chaplain',
            name: 'Chaplain',
            type: 'model',
            costs: points(60),
            categoryLinks: categories('Faction: Adeptus Astartes'),
          },
        ],
      },
      {
        name: 'Imperium - Adeptus Astartes - Black Templars',
        selectionEntries: [
          {
            id: 'black-templars-chaplain',
            name: 'Chaplain',
            type: 'model',
            costs: points(60),
            categoryLinks: categories('Faction: Adeptus Astartes'),
          },
        ],
      },
    )

    expect(datasheetInBySlug(shelf, 'cat', 'chaplain')?.name).toBe('Chaplain')
    expect(datasheetInBySlug(shelf, 'cat-1', 'chaplain')).toBeNull()
    expect(unitsIn(shelf, 'cat-1', '').map((unit) => unit.name)).toEqual(['Chaplain'])
  })

  it('keeps generic Heretic Astartes datasheets off legion reference pages', () => {
    const shelf = shelfOf(
      {
        name: 'Chaos - Chaos Space Marines',
        selectionEntries: [
          {
            id: 'chaos-lord',
            name: 'Chaos Lord',
            type: 'model',
            costs: points(90),
            categoryLinks: categories('Faction: Heretic Astartes'),
          },
        ],
      },
      {
        name: 'Chaos - World Eaters',
        selectionEntries: [
          {
            id: 'world-eaters-chaos-lord',
            name: 'Chaos Lord',
            type: 'model',
            costs: points(90),
            categoryLinks: categories('Faction: Heretic Astartes'),
          },
        ],
      },
    )

    expect(datasheetInBySlug(shelf, 'cat', 'chaos-lord')?.name).toBe('Chaos Lord')
    expect(datasheetInBySlug(shelf, 'cat-1', 'chaos-lord')).toBeNull()
    expect(unitsIn(shelf, 'cat-1', '').map((unit) => unit.name)).toEqual(['Chaos Lord'])
  })

  it('keeps a named faction datasheet off an allied reference page', () => {
    const shelf = shelfOf(
      {
        name: 'Astra Militarum',
        selectionEntries: [
          {
            id: 'guardsmen',
            name: 'Cadian Shock Troops',
            type: 'unit',
            costs: points(65),
            categoryLinks: categories('Faction: Astra Militarum'),
          },
        ],
      },
      {
        name: 'Genestealer Cults',
        selectionEntries: [
          {
            id: 'cult-guardsmen',
            name: 'Cadian Shock Troops',
            type: 'unit',
            costs: points(65),
            categoryLinks: categories('Faction: Astra Militarum'),
          },
        ],
      },
    )

    expect(datasheetInBySlug(shelf, 'cat', 'cadian-shock-troops')?.name).toBe('Cadian Shock Troops')
    expect(datasheetInBySlug(shelf, 'cat-1', 'cadian-shock-troops')).toBeNull()
    expect(unitsIn(shelf, 'cat-1', '').map((unit) => unit.name)).toEqual(['Cadian Shock Troops'])
  })

  it('filters a cached priced faction list without rebuilding its summaries', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'warden', name: 'Royal Warden', type: 'unit', costs: points(40) },
        { id: 'warriors', name: 'Necron Warriors', type: 'unit', costs: points(100) },
      ],
    })
    const all = unitsIn(book, 'cat', '')
    const filtered = unitsIn(book, 'cat', 'warden')

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toBe(all[1])
  })

  it('reuses the unconditional cache for unknown detachment IDs', () => {
    const book = bookOf({ selectionEntries: [{ id: 'warriors', name: 'Necron Warriors', type: 'unit', costs: points(100) }] })
    const baseline = unitsIn(book, 'cat', '')
    expect(unitsIn(book, 'cat', '', { detachmentIds: ['unknown'] })[0]).toBe(baseline[0])
  })

  it('lists what the faction cards list, with apostrophes folded and a plural forgiven', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'ctan', name: "Transcendent C'tan", type: 'model', costs: points(295) },
        { id: 'walker', name: 'Plague Walker', type: 'model', costs: points(100) },
        { id: 'legend', name: 'Tomb Stalker [Legends]', type: 'model', costs: points(150) },
      ],
    })
    book.factionContents.set('test-catalogue', withCards('Test catalogue', ['Transcendent C’tan', 'Plague Walkers']))

    expect(unitsIn(book, 'cat', '', { factionCards: true }).map((unit) => unit.name)).toEqual(['Plague Walker', "Transcendent C'tan"])
  })

  it('lists Legends datasheets beside the cards on a faction page, since no card export prints them', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'walker', name: 'Plague Walker', type: 'model', costs: points(100) },
        { id: 'uncarded', name: 'Tomb Sentinel', type: 'model', costs: points(120) },
        { id: 'legend', name: 'Tomb Stalker [Legends]', type: 'model', costs: points(150) },
      ],
    })
    book.factionContents.set('test-catalogue', withCards('Test catalogue', ['Plague Walkers']))

    expect(unitsIn(book, 'cat', '', { factionCards: true, nonMatchedPlay: true }).map((unit) => unit.name)).toEqual([
      'Plague Walker',
      'Tomb Stalker [Legends]',
    ])
  })

  it('lists the whole book when the faction has no cards', () => {
    const book = bookOf({ selectionEntries: [{ id: 'ctan', name: "Transcendent C'tan", type: 'model', costs: points(295) }] })

    expect(unitsIn(book, 'cat', '', { factionCards: true }).map((unit) => unit.name)).toEqual(["Transcendent C'tan"])
  })

  it('shelves every datasheet by its primary category', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'hero', name: 'Hero', type: 'model', costs: points(100), categoryLinks: categories('Epic Hero', 'Character', 'Infantry') },
        { id: 'lord', name: 'Lord', type: 'model', costs: points(90), categoryLinks: categories('Character', 'Infantry') },
        { id: 'grunts', name: 'Grunts', type: 'unit', costs: points(70), categoryLinks: categories('Battleline') },
        { id: 'troops', name: 'Troops', type: 'unit', costs: points(80), categoryLinks: categories('Infantry') },
        { id: 'critters', name: 'Critters', type: 'unit', costs: points(30), categoryLinks: categories('Swarm') },
        { id: 'riders', name: 'Riders', type: 'unit', costs: points(75), categoryLinks: categories('Mounted') },
        { id: 'hounds', name: 'Hounds', type: 'unit', costs: points(65), categoryLinks: categories('Beast') },
        { id: 'giant', name: 'Giant', type: 'unit', costs: points(175), categoryLinks: categories('Monster') },
        { id: 'tank', name: 'Tank', type: 'unit', costs: points(150), categoryLinks: categories('Vehicle') },
        { id: 'drone', name: 'Drone', type: 'unit', costs: points(50), categoryLinks: categories('Drone') },
        { id: 'ride', name: 'Ride', type: 'unit', costs: points(60), categoryLinks: categories('Dedicated Transport', 'Vehicle') },
        { id: 'wall', name: 'Wall', type: 'unit', costs: points(85), categoryLinks: categories('Fortification') },
      ],
    })
    expect(Object.fromEntries(unitsIn(book, 'cat', '').map((unit) => [unit.name, unit.group]))).toEqual({
      Hero: 'epic-hero',
      Lord: 'character',
      Grunts: 'battleline',
      Troops: 'infantry',
      Critters: 'swarm',
      Riders: 'mounted',
      Hounds: 'beast',
      Giant: 'monster',
      Tank: 'vehicle',
      Drone: 'drone',
      Ride: 'transport',
      Wall: 'fortification',
    })
  })

  it('shelves a datasheet with no recognised primary category under other', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'missing', name: 'Missing', type: 'unit', costs: points(10) },
        { id: 'unsupported', name: 'Unsupported', type: 'unit', costs: points(20), categoryLinks: categories('Pilot', 'Infantry') },
      ],
    })
    expect(Object.fromEntries(unitsIn(book, 'cat', '').map((unit) => [unit.name, unit.group]))).toEqual({
      Missing: 'other',
      Unsupported: 'other',
    })
  })

  it('omits datasheets excluded by faction rules', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'allowed', name: 'Intercessor Squad', type: 'unit', costs: points(80) },
        { id: 'excluded', name: 'Scout Squad', type: 'unit', costs: points(70) },
      ],
    })
    expect(
      unitsIn(book, 'cat', '', {
        restrictions: { excludedNames: new Map([['scout squad', null]]), excludedKeywords: new Set() },
      }).map((unit) => unit.name),
    ).toEqual(['Intercessor Squad'])
  })

  it('omits datasheets excluded by a faction keyword rule', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'marshal', name: 'Marshal', type: 'model', costs: points(80), categoryLinks: categories('Character') },
        { id: 'librarian', name: 'Librarian', type: 'model', costs: points(90), categoryLinks: categories('Character', 'Psyker') },
      ],
    })
    expect(
      unitsIn(book, 'cat', '', {
        restrictions: { excludedNames: new Map(), excludedKeywords: new Set(['psyker']) },
      }).map((unit) => unit.name),
    ).toEqual(['Marshal'])
  })

  it('omits one excluded by a keyword the data grants rather than links', () => {
    // Legality reads the keywords a unit carries, so the picker has to read the same
    // ones: offering a datasheet the roster will then refuse is the worse answer.
    const book = bookOf({
      categoryEntries: [{ id: 'psyker', name: 'Psyker' }],
      selectionEntries: [
        { id: 'marshal', name: 'Marshal', type: 'model', costs: points(80), categoryLinks: categories('Character') },
        {
          id: 'librarian',
          name: 'Librarian',
          type: 'model',
          costs: points(90),
          categoryLinks: categories('Character'),
          modifiers: [{ type: 'add', field: 'category', value: 'psyker' }],
        },
      ],
    })
    expect(
      unitsIn(book, 'cat', '', {
        restrictions: { excludedNames: new Map(), excludedKeywords: new Set(['psyker']) },
      }).map((unit) => unit.name),
    ).toEqual(['Marshal'])
  })

  it('prices compulsory detachment upgrades and keeps setup caches separate', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'detachments',
          name: 'Detachment',
          type: 'upgrade',
          costs: points(10),
          selectionEntryGroups: [
            {
              id: 'detachment-choices',
              name: 'Detachment',
              selectionEntries: [
                { id: 'pantheon', name: 'Pantheon of Woe', type: 'upgrade' },
                { id: 'other', name: 'Other', type: 'upgrade' },
              ],
            },
          ],
        },
        {
          id: 'ctan',
          name: "C'tan Shard",
          type: 'model',
          costs: points(330),
          selectionEntries: [
            {
              id: 'matrix',
              name: 'Singularity Matrix',
              type: 'upgrade',
              hidden: true,
              costs: points(45),
              constraints: [
                { id: 'matrix-min', type: 'min', value: 0, field: 'selections', scope: 'parent' },
                { id: 'matrix-max', type: 'max', value: 0, field: 'selections', scope: 'parent' },
              ],
              modifierGroups: [
                {
                  conditions: [
                    { type: 'atLeast', value: 1, field: 'selections', scope: 'force', childId: 'pantheon', includeChildSelections: true },
                  ],
                  modifiers: [
                    { type: 'set', field: 'hidden', value: false },
                    { type: 'set', field: 'matrix-min', value: 1 },
                    { type: 'set', field: 'matrix-max', value: 1 },
                  ],
                },
              ],
            },
          ],
        },
        { id: 'warrior', name: 'Warrior', type: 'model', costs: points(100) },
      ],
    })
    const prices = (detachmentIds: string[]) =>
      Object.fromEntries(pickerUnitsFor(book, null, 'cat', '', 2000, [], detachmentIds).map((unit) => [unit.id, unit.points]))
    const baseline = prices([])
    const pantheon = prices(['pantheon'])
    const roster = calculateRosterPrice(
      { catalogueId: 'cat', detachmentIds: ['pantheon'], disposition: null, limit: 2000, units: [{ entryId: 'ctan' }] },
      book,
      null,
    )
    expect({
      baseline,
      pantheon,
      other: prices(['other']),
      combined: prices(['other', 'pantheon']),
      restored: prices([]),
      rosterUnit: roster?.units[0]?.points,
    }).toEqual({
      baseline: { ctan: 330, warrior: 100 },
      pantheon: { ctan: 375, warrior: 100 },
      other: { ctan: 330, warrior: 100 },
      combined: { ctan: 375, warrior: 100 },
      restored: { ctan: 330, warrior: 100 },
      rosterUnit: 375,
    })
  })

  it('prices the smallest legal version of each datasheet', () => {
    const book = bookOf({
      selectionEntries: [
        {
          id: 'squad',
          name: 'Squad',
          type: 'unit',
          costs: points(0),
          selectionEntries: [
            {
              id: 'body',
              name: 'Body',
              type: 'model',
              costs: points(20),
              constraints: [{ id: 'body-min', type: 'min', value: 3, field: 'selections', scope: 'parent' }],
            },
          ],
        },
      ],
    })
    expect(unitsIn(book, 'cat', '')[0]?.points).toBe(60)
  })

  it('offers the whole book, not the first page of it', () => {
    // A book runs to well over a hundred datasheets and the picker sorts them by
    // name, so anything cut off the end takes the back half of the alphabet with it:
    // a Space Marine player could find no Sternguard on any shelf.
    const names = Array.from({ length: 120 }, (_, at) => `Squad ${String(at).padStart(3, '0')}`)
    const book = bookOf({
      selectionEntries: names.map((name, at) => ({ id: `unit-${at}`, name, type: 'unit', costs: points(10) })),
    })
    expect(offered(book)).toEqual(names)
  })

  it('offers a datasheet the book reaches by a link', () => {
    // How most of the game is written: the datasheets live in a library, and a book
    // states its roster as links into it.
    const shelf = shelfOf(
      { entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }] },
      { library: true, sharedSelectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(70) }] },
    )
    expect(offered(shelf)).toEqual(['Squad'])
    expect(unitsIn(shelf, 'cat', '')[0]?.points).toBe(70)
  })

  it('offers the datasheets of a book it imports, and not of one it merely links', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Ours', type: 'unit', costs: points(10) }],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          // Linked to reach the rules that mention it, not to field it.
          { targetId: 'cat-2' },
        ],
      },
      { selectionEntries: [{ id: 'theirs', name: 'Theirs', type: 'unit', costs: points(20) }] },
      { selectionEntries: [{ id: 'mentioned', name: 'Mentioned', type: 'unit', costs: points(30) }] },
    )
    expect(offered(shelf)).toEqual(['Ours', 'Theirs'])
  })

  it('marks secondary imported books as allies while keeping the main imported roster primary', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Ours', type: 'unit', costs: points(10) }],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
          { targetId: 'cat-3', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'main-one', name: 'Main One', type: 'unit', costs: points(20) },
          { id: 'main-two', name: 'Main Two', type: 'unit', costs: points(20) },
        ],
      },
      { selectionEntries: [{ id: 'agent', name: 'Agent', type: 'unit', costs: points(30) }] },
      { selectionEntries: [{ id: 'knight', name: 'Knight', type: 'unit', costs: points(40) }] },
    )

    expect(Object.fromEntries(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction]))).toEqual({
      'Main One': null,
      'Main Two': null,
      Ours: null,
      Agent: 'Book 2',
      Knight: 'Book 3',
    })
  })

  it('offers transitive allies once through cycles without importing rules-only links', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Ours', type: 'unit', costs: points(10) }],
        catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
      },
      {
        selectionEntries: [
          { id: 'main-one', name: 'Main One', type: 'unit', costs: points(20) },
          { id: 'main-two', name: 'Main Two', type: 'unit', costs: points(20) },
        ],
        catalogueLinks: [
          { targetId: 'cat-2', importRootEntries: true },
          { targetId: 'cat', importRootEntries: true },
          { targetId: 'cat-3' },
          { targetId: 'missing', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [{ id: 'agent', name: 'Agent', type: 'unit', costs: points(30) }],
        catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
      },
      { selectionEntries: [{ id: 'mentioned', name: 'Mentioned', type: 'unit', costs: points(40) }] },
    )

    expect(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction])).toEqual([
      ['Main One', null],
      ['Main Two', null],
      ['Ours', null],
      ['Agent', 'Book 2'],
    ])
  })

  it('uses faction categories when the first imported book is an allied roster', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [
          { id: 'mechanicus', name: 'Skitarii', type: 'unit', costs: points(10), categoryLinks: categories('Faction: Adeptus Mechanicus') },
        ],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'callidus', name: 'Callidus Assassin', type: 'model', costs: points(100), categoryLinks: categories('Faction: Agents') },
          { id: 'vindicary', name: 'Vindicare Assassin', type: 'model', costs: points(100), categoryLinks: categories('Faction: Agents') },
        ],
      },
      {
        selectionEntries: [
          {
            id: 'common',
            name: 'Common Mechanicus Unit',
            type: 'unit',
            costs: points(20),
            categoryLinks: categories('Faction: Adeptus Mechanicus'),
          },
        ],
      },
    )

    expect(Object.fromEntries(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction]))).toEqual({
      Skitarii: null,
      'Common Mechanicus Unit': null,
      'Callidus Assassin': 'Book 1',
      'Vindicare Assassin': 'Book 1',
    })
  })

  it('marks a directly linked datasheet from another faction as allied', () => {
    const shelf = shelfOf(
      {
        name: 'Genestealer Cults',
        selectionEntries: [
          { id: 'cultists', name: 'Cultists', type: 'unit', costs: points(10), categoryLinks: categories('Faction: Genestealer Cults') },
        ],
        entryLinks: [{ id: 'cadians', name: 'Cadian Shock Troops', targetId: 'cadian-target', type: 'selectionEntry' }],
        catalogueLinks: [{ targetId: 'cat-1' }],
      },
      {
        name: 'Astra Militarum Library',
        selectionEntries: [
          {
            id: 'cadian-target',
            name: 'Cadian Shock Troops',
            type: 'unit',
            costs: points(60),
            categoryLinks: categories('Faction: Astra Militarum'),
          },
        ],
      },
    )

    expect(unitsIn(shelf, 'cat', '').find((unit) => unit.name === 'Cadian Shock Troops')?.alliedFaction).toBe('Astra Militarum Library')
  })

  it('keeps allied units after the whole primary book', () => {
    const shelf = shelfOf(
      {
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'alpha', name: 'Alpha', type: 'unit', costs: points(20) },
          { id: 'bravo', name: 'Bravo', type: 'unit', costs: points(20) },
        ],
      },
      { selectionEntries: [{ id: 'ally', name: 'Aaron the Ally', type: 'unit', costs: points(30) }] },
    )

    expect(unitsIn(shelf, 'cat', '').map((unit) => [unit.name, unit.alliedFaction])).toEqual([
      ['Alpha', null],
      ['Bravo', null],
      ['Aaron the Ally', 'Book 2'],
    ])
  })

  it('offers a datasheet reached twice only once', () => {
    const shelf = shelfOf(
      {
        entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }],
        catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }],
      },
      {
        library: true,
        sharedSelectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(70) }],
        entryLinks: [{ id: 'theirs', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }],
      },
    )
    expect(unitsIn(shelf, 'cat', '').map((unit) => unit.id)).toEqual(['ours'])
  })

  it('leaves out a body that only exists inside a squad', () => {
    // A sergeant is a model entry sitting at the top of the file exactly as its
    // squad does; what makes the squad pickable is that the book links to it.
    const shelf = bookOf({
      sharedSelectionEntries: [
        { id: 'squad', name: 'Squad', type: 'unit', costs: points(70) },
        { id: 'sergeant', name: 'Sergeant', type: 'model', costs: points(20) },
      ],
      entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }],
    })
    expect(offered(shelf)).toEqual(['Squad'])
  })

  describe('Legends and Crucible datasheets', () => {
    const book = bookOf({
      selectionEntries: [
        { id: 'squad', name: 'Squad', type: 'unit', costs: points(70) },
        { id: 'old', name: 'Land Speeder [Legends]', type: 'unit', costs: points(60) },
        { id: 'crucible', name: 'Champion [Crucible]', type: 'unit', costs: points(60) },
      ],
    })

    it('are left out of matched-play lists', () => {
      expect(offered(book)).toEqual(['Squad'])
    })

    it('are offered to the roster picker marked by kind', () => {
      expect(unitsIn(book, 'cat', '', { nonMatchedPlay: true }).map((unit) => [unit.name, unit.nonMatchedPlay])).toEqual([
        ['Champion [Crucible]', 'crucible'],
        ['Land Speeder [Legends]', 'legends'],
        ['Squad', undefined],
      ])
    })
  })

  it('offers Legends fortifications from the Unaligned Forces shelf to the roster picker', () => {
    const shelf = shelfOf(
      { catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }] },
      {
        selectionEntries: [
          { id: 'sentry', name: 'Sentry Gun', type: 'model', costs: points(40) },
          { id: 'bastion', name: 'Bastion [Legends]', type: 'model', costs: points(150) },
        ],
        name: 'Unaligned Forces',
      },
    )
    expect(unitsIn(shelf, 'cat', '', { nonMatchedPlay: true }).map((unit) => unit.name)).toEqual(['Bastion [Legends]'])
  })

  it('does not offer reference-only spawned units as roster choices', () => {
    const book = bookOf({
      categoryEntries: [{ id: 'reference', name: 'Reference' }],
      selectionEntries: [
        { id: 'biovore', name: 'Biovore', type: 'unit', costs: points(60) },
        {
          id: 'mines',
          name: 'Spore Mines (Biovore)',
          type: 'unit',
          costs: points(0),
          categoryLinks: [{ id: 'reference-link', targetId: 'reference', name: 'Reference', primary: true }],
        },
      ],
    })
    expect(offered(book)).toEqual(['Biovore'])
  })

  it('never offers mission assets from the Unaligned Forces shelf', () => {
    const shelf = shelfOf(
      {
        selectionEntries: [{ id: 'ours', name: 'Squad', type: 'unit', costs: points(70) }],
        catalogueLinks: [
          { targetId: 'cat-1', importRootEntries: true },
          { targetId: 'cat-2', importRootEntries: true },
        ],
      },
      {
        selectionEntries: [
          { id: 'main-one', name: 'Main One', type: 'unit', costs: points(20) },
          { id: 'main-two', name: 'Main Two', type: 'unit', costs: points(20) },
        ],
      },
      { selectionEntries: [{ id: 'sentry', name: 'Sentry Gun', type: 'model', costs: points(40) }], name: 'Unaligned Forces' },
    )

    expect(offered(shelf)).toEqual(['Main One', 'Main Two', 'Squad'])
    expect(unitsIn(shelf, 'cat', 'Sentry Gun')).toEqual([])

    const onlyImport = shelfOf(
      { catalogueLinks: [{ targetId: 'cat-1', importRootEntries: true }] },
      { selectionEntries: [{ id: 'sentry', name: 'Sentry Gun', type: 'model', costs: points(40) }], name: 'Unaligned Forces' },
    )
    expect(unitsIn(onlyImport, 'cat', '')).toEqual([])
  })

  it('does not offer a library as a faction', () => {
    const shelf = shelfOf(
      { entryLinks: [{ id: 'ours', targetId: 'squad', name: 'Squad', type: 'selectionEntry' }] },
      { library: true, sharedSelectionEntries: [{ id: 'squad', name: 'Squad', type: 'unit', costs: points(70) }] },
    )
    expect(shelf.factions.map((faction) => faction.id)).toEqual(['cat'])
  })
})

describe('picker attachment facts', () => {
  const loaded = bookOf({
    categoryEntries: [{ id: 'command', name: 'Command Squad' }],
    selectionEntries: [
      {
        id: 'leader',
        name: 'Captain',
        type: 'unit',
        categoryLinks: [{ id: 'command-link', targetId: 'command' }],
        profiles: [
          {
            id: 'leader-rule',
            name: 'Leader',
            typeName: 'Abilities',
            characteristics: [{ name: 'Description', $text: 'This model can be attached to the following unit:\n- Bodyguard' }],
          },
        ],
      },
      {
        id: 'host',
        name: 'Bodyguard',
        type: 'unit',
        constraints: [{ id: 'leaders', childName: 'Leader', type: 'max', field: 'associations', scope: 'self', value: 2 }],
      },
    ],
  })

  it('projects supported leader eligibility from the selected catalogue source', () => {
    expect(pickerUnitsFor(loaded, null, 'cat', '').find((unit) => unit.id === 'leader')?.attachment).toEqual({
      kind: 'leader',
      targets: ['Bodyguard'],
    })
  })
  it('projects the bodyguard’s source-defined leader capacity', () => {
    expect(pickerUnitsFor(loaded, null, 'cat', '').find((unit) => unit.id === 'host')?.attachmentLimits?.leader).toBe(2)
  })
  it('retains the source category used by shared attachment caps', () => {
    expect(pickerUnitsFor(loaded, null, 'cat', '').find((unit) => unit.id === 'leader')?.attachmentCategories).toContain('id:command')
  })
  it('does not invent eligibility when the source supplies none', () => {
    expect(pickerUnitsFor(loaded, null, 'cat', '').find((unit) => unit.id === 'host')?.attachment).toBeNull()
  })
})

it('discovers a leader whose supported relationship exists only as a source association', () => {
  const loaded = bookOf({
    selectionEntries: [
      {
        id: 'captain',
        name: 'Captain',
        type: 'unit',
        associations: [
          {
            name: 'Leading',
            action: 'group',
            childId: 'unit',
            conditions: [{ type: 'instanceOf', value: 1, field: 'selections', scope: 'self', childId: 'host' }],
          },
        ],
      },
      { id: 'host', name: 'Bodyguard', type: 'unit' },
    ],
  })
  expect(pickerUnitsFor(loaded, null, 'cat', '').find((unit) => unit.id === 'captain')?.attachment).toEqual({
    kind: 'leader',
    targets: ['Bodyguard'],
  })
})
