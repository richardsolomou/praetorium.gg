import { describe, expect, it } from 'vitest'
import {
  canAddPooledOption,
  changedDraftSpreadCounts,
  choiceRemoval,
  controlledProfileCount,
  donorPriority,
  type LoadoutChoice,
  type LoadoutModel,
  loadoutRowCount,
  loadoutInstructions,
  modelCount,
  ordered,
  orderedModelWargear,
  poolHandlers,
  orderedChoices,
  replacementChoice,
  sameWeapon,
  showLoadoutEntry,
  spreadHandlers,
  uniqueWeaponProfiles,
  weaponMatches,
  weaponProfilesFor,
  wargearMatches,
  wholeSquadTakes,
  withDraftSpreadCounts,
} from './loadoutModel'

const option = (id: string, count: number, max: number) => ({ id, name: id, points: 0, count, min: 0, max })

const choice = (options: LoadoutChoice['options'], room: number, optional = false): LoadoutChoice => ({
  key: 'group',
  name: 'Group',
  chosen: '',
  optional,
  carried: false,
  room,
  uniform: false,
  owner: null,
  options,
})

const weapon = (name: string, type: string) => ({ id: name, name, type, values: [] })

describe('loadout instructions', () => {
  const trooper: LoadoutModel = { name: 'Trooper', fixed: [], members: [], rows: [] }
  const leader: LoadoutModel = { ...trooper, name: 'Leader' }

  it('uses the rule for the complete pair rather than another loadout sharing its blade', () => {
    expect(
      loadoutInstructions(
        { name: 'Rifle and Blade', pieces: ['Rifle', 'Blade'] },
        trooper,
        [trooper],
        [
          { instruction: 'Take Rifle and Blade together.', options: ['Rifle', 'Blade'] },
          { instruction: 'Take Cannon and Blade together.', options: ['Cannon', 'Blade'] },
        ],
      ),
    ).toEqual(['Take Rifle and Blade together.'])
  })

  it('keeps a leader restriction off the same weapon offered to ordinary troops', () => {
    expect(
      loadoutInstructions(
        { name: 'Plasma gun' },
        trooper,
        [trooper, leader],
        [
          { instruction: 'The Leader can replace their rifle with a plasma gun.', options: ['Plasma gun'] },
          { instruction: 'One Trooper can take one of these weapons.', options: ['Plasma gun', 'Meltagun'] },
        ],
      ),
    ).toEqual(['One Trooper can take one of these weapons.'])
  })

  it('matches a wargear ability with a source suffix without inventing a rule for a default weapon', () => {
    expect(
      loadoutInstructions(
        { name: 'Rifle and Icon', pieces: ['Rifle', 'Icon'] },
        trooper,
        [trooper],
        [
          { instruction: 'Default Wargear', options: ['Rifle'] },
          { instruction: 'One model can carry an icon.', options: ['Icon (Aura)'] },
        ],
      ),
    ).toEqual(['One model can carry an icon.'])
  })
})

describe('showing loadout entries', () => {
  it('hides empty wargear from a finished roster', () => {
    expect(showLoadoutEntry(0, false)).toBe(false)
    expect(showLoadoutEntry(2, false)).toBe(true)
  })

  it('keeps empty wargear available while editing', () => {
    expect(showLoadoutEntry(0, true)).toBe(true)
  })
})

it('does not remove a mandatory copy while allowing an additional copy', () => {
  const gauntlet = { ...option('gauntlet', 1, 2), min: 1 }
  const handlers = spreadHandlers(choice([gauntlet], 2))

  expect(handlers.less(gauntlet)).toBeNull()
  expect(handlers.more(gauntlet)).toEqual({ gauntlet: 2 })
})

it('applies pending draft counts without replacing untouched evaluated counts', () => {
  const group = choice([option('blaster', 8, 10), option('carbine', 2, 10), option('special', 0, 1)], 10)

  expect(withDraftSpreadCounts([group], { group: { blaster: 7, carbine: 3 } })[0]?.options.map(({ count }) => count)).toEqual([7, 3, 0])
})

it('keeps only spread groups changed since the evaluated result', () => {
  const evaluated = { weapons: { blaster: 8, carbine: 2 }, settled: { invalid: 3 } }
  const current = { weapons: { blaster: 7, carbine: 3 }, settled: { invalid: 3 } }

  expect(changedDraftSpreadCounts(current, evaluated)).toEqual({ weapons: current.weapons })
})

describe('matching a wargear name to what describes it', () => {
  it('counts every copy of a weapon represented by one selected option', () => {
    const stormBolters = {
      ...option('storm-bolters', 1, 1),
      name: '2 Storm Bolters',
      pieceCounts: [{ name: 'Storm bolter', count: 2 }],
    }

    expect(controlledProfileCount([choice([stormBolters], 1)], 'Storm bolter')).toBe(2)
  })

  it('does not multiply totals from repeated selections twice', () => {
    const rifles = {
      ...option('rifles', 3, 3),
      name: 'Bolt Rifle w/ Grenade Launcher',
      pieceCounts: [{ name: 'Bolt Rifle', count: 3 }],
    }

    expect(controlledProfileCount([choice([rifles], 3)], 'Bolt Rifle')).toBe(3)
  })

  it('reads a parenthesised mode as the same weapon', () => {
    expect(sameWeapon('Staff of light', 'Staff of light (Melee)')).toBe(true)
    expect(sameWeapon('Staff of light (Ranged)', 'Staff of light (Melee)')).toBe(true)
  })

  it.each([
    ['➤ Bellicatus missile array - Frag', 'Bellicatus missile array (Icarus)'],
    ['➤ Plasma pistol - Supercharge', 'Plasma pistol (Standard)'],
  ])('reads marked and parenthesised modes as the same weapon', (marked, parenthesised) => {
    expect(sameWeapon(marked, parenthesised)).toBe(true)
  })

  it('keeps two different weapons apart', () => {
    expect(sameWeapon('Gauss flayer', 'Gauss reaper')).toBe(false)
  })

  it('matches straight and curly apostrophes', () => {
    expect(sameWeapon("Dragon's Breath Flamer", 'Dragon’s breath flamer')).toBe(true)
  })

  it('keeps marked profiles of different weapons apart', () => {
    expect(sameWeapon('➤ Bellicatus missile array - Frag', 'Multi-melta (Melta)')).toBe(false)
  })

  it('matches a profile named after the option, with or without a mode', () => {
    expect(weaponMatches('Bolt rifle', 'Bolt rifle')).toBe(true)
    expect(weaponMatches('Bolt rifle', 'Bolt rifle (Heavy)')).toBe(true)
    expect(weaponMatches('Bolt rifle', 'Bolt pistol')).toBe(false)
  })

  it('matches a profile the option pairs with something else', () => {
    expect(weaponMatches('Chainsword and bolt pistol', 'Chainsword')).toBe(true)
  })

  it('matches spacing differences between an option and its profile', () => {
    expect(weaponMatches('Veteran w/ Black Shield blades', 'Blackshield blades')).toBe(true)
  })

  it('matches a marked, hyphen-separated mode such as a missile launcher prints', () => {
    expect(weaponMatches('Missile Launcher', '➤ Missile Launcher - Frag')).toBe(true)
    expect(weaponMatches('Missile Launcher', '➤ Missile Launcher - Krak')).toBe(true)
    expect(weaponMatches('Missile Launcher', '➤ Multi-melta - Melta')).toBe(false)
  })

  it('matches marked modes of one weapon in a combined option', () => {
    expect(weaponMatches('Cyclone Missile Launcher & Storm Bolter', '➤ Cyclone missile launcher - frag')).toBe(true)
    expect(weaponMatches('Cyclone Missile Launcher & Storm Bolter', '➤ Cyclone missile launcher - krak')).toBe(true)
  })

  it('finds the selected weapons nested inside a composite option', () => {
    const profiles = [
      weapon('Bolt pistol', 'Ranged Weapons'),
      weapon('Master-crafted bolter', 'Ranged Weapons'),
      weapon('Close combat weapon', 'Melee Weapons'),
    ]

    expect(
      weaponProfilesFor(
        {
          name: 'Bolt Pistol, Master-crafted Bolter, Melee Weapon',
          pieces: ['Bolt pistol', 'Master-crafted bolter', 'Close combat weapon'],
        },
        profiles,
      ).map((profile) => profile.name),
    ).toEqual(['Bolt pistol', 'Master-crafted bolter', 'Close combat weapon'])
  })

  it('matches a rule the same way a profile is matched', () => {
    expect(wargearMatches('Storm shield', 'Storm shield')).toBe(true)
    expect(wargearMatches('Storm shield and thunder hammer', 'Storm shield')).toBe(true)
    expect(wargearMatches('Storm shield', 'Iron halo')).toBe(false)
  })

  it('collapses equivalent profiles whose names differ only in presentation', () => {
    const profiles = [
      { ...weapon('Storm Bolter', 'Ranged Weapons'), id: 'sergeant', values: [{ name: 'BS', value: '3+' }] },
      { ...weapon('Storm bolter', 'Ranged Weapons'), id: 'terminator', values: [{ name: 'BS', value: '3+' }] },
    ]

    expect(uniqueWeaponProfiles(profiles).map(({ id }) => id)).toEqual(['sergeant'])
  })

  it('preserves genuinely different profiles of the same weapon', () => {
    const profiles = [
      { ...weapon('Storm Bolter', 'Ranged Weapons'), id: 'standard', values: [{ name: 'BS', value: '3+' }] },
      { ...weapon('Storm bolter', 'Ranged Weapons'), id: 'improved', values: [{ name: 'BS', value: '2+' }] },
    ]

    expect(uniqueWeaponProfiles(profiles).map(({ id }) => id)).toEqual(['standard', 'improved'])
  })
})

describe('reading model-card rows', () => {
  const owner = { id: 'terminator', name: 'Terminator', profile: 'Terminator' }
  const group = (key: string, chosen: string, ...options: LoadoutChoice['options']): LoadoutChoice => ({
    key,
    name: key,
    chosen,
    optional: false,
    carried: false,
    room: 1,
    uniform: false,
    owner,
    options,
  })

  it('adds the counts of same-named rows from separate choices', () => {
    const row = {
      name: 'Accursed weapon',
      choiceKey: 'left',
      optionId: 'left-weapon',
      alternatives: [{ choiceKey: 'right', optionId: 'right-weapon' }],
    }
    const choices = [
      group('left', 'left-weapon', option('left-weapon', 1, 1)),
      group('right', 'right-weapon', option('right-weapon', 1, 1)),
    ]

    expect(loadoutRowCount(row, choices)).toBe(2)
  })

  it('replaces only a composite option that contains the requested weapon', () => {
    const stormBolter = { name: 'Storm Bolter', choiceKey: 'guns', optionId: 'storm-bolter' }
    const chainfist = { name: 'Chainfist', choiceKey: 'fists', optionId: 'chainfist' }
    const cyclone = {
      name: 'Cyclone Missile Launcher & Storm Bolter',
      choiceKey: 'heavy',
      optionId: 'cyclone',
      pieces: ['Cyclone missile launcher', 'Storm bolter'],
    }
    const model: LoadoutModel = {
      name: 'Terminator',
      fixed: [],
      members: [],
      rows: [stormBolter, chainfist, cyclone],
    }
    const choices = [
      group('guns', 'storm-bolter', option('storm-bolter', 3, 5)),
      group('fists', 'power-fist', option('power-fist', 4, 5), option('chainfist', 0, 5)),
      group('heavy', 'cyclone', option('cyclone', 1, 1)),
    ]

    expect(replacementChoice(stormBolter, model, choices, 5)?.key).toBe('heavy')
    expect(replacementChoice(chainfist, model, choices, 5)).toBeNull()
  })

  it('removes optional choices and model-specific composite replacements', () => {
    const selected = option('cyclone', 1, 1)

    expect(choiceRemoval({ ...group('heavy', 'cyclone', selected), optional: true }, selected, false)).toBe('')
    expect(choiceRemoval(group('heavy', 'cyclone', selected), selected, true)).toBe('')
    expect(choiceRemoval(group('fist', 'power-fist', selected), selected, false)).toBeNull()
  })

  it('allows one full-pool replacement without exceeding the resulting maximum', () => {
    const donor = { choice: group('guns', 'rifle', option('rifle', 1, 1)), option: option('rifle', 1, 1) }
    const special = { ...option('special', 0, 0), replacements: [{ choiceKey: 'guns', optionId: 'rifle' }] }

    expect(canAddPooledOption(special, donor)).toBe(true)
    expect(canAddPooledOption(option('special', 1, 1), donor)).toBe(false)
    expect(canAddPooledOption(special)).toBe(false)
  })
})

describe('ordering the rows on a model card', () => {
  const weapons = [
    weapon('Bolt carbine', 'Ranged Weapons'),
    weapon('Combat knife', 'Melee Weapons'),
    weapon('Combi-weapon', 'Ranged Weapons'),
    weapon('Combi-weapon', 'Melee Weapons'),
  ]

  it('puts everything shot with before everything swung with', () => {
    const rows = [{ name: 'Combat knife' }, { name: 'Bolt carbine' }]
    expect(ordered(rows, weapons, (entry) => entry.name).map((entry) => entry.name)).toEqual(['Bolt carbine', 'Combat knife'])
  })

  it('keeps a combi-weapon among the guns even though it also fights', () => {
    const rows = [{ name: 'Combat knife' }, { name: 'Combi-weapon' }]
    expect(ordered(rows, weapons, (entry) => entry.name).map((entry) => entry.name)).toEqual(['Combi-weapon', 'Combat knife'])
  })

  it('keeps a cluster together, in the place its first entry earns', () => {
    const rows = [{ name: 'Bolt carbine' }, { name: 'Plasma pistol' }, { name: 'Combat knife' }]
    const clusterOf = (entry: { name: string }) => (entry.name === 'Combat knife' ? 'wargear:Bolt carbine' : `wargear:${entry.name}`)
    // The knife travels with the carbine it is traded for, ahead of the pistol.
    expect(ordered(rows, [...weapons, weapon('Plasma pistol', 'Ranged Weapons')], clusterOf).map((entry) => entry.name)).toEqual([
      'Bolt carbine',
      'Combat knife',
      'Plasma pistol',
    ])
  })
})

describe('ordering the questions the unit answers as a whole', () => {
  const weapons = [
    weapon('Overlord\u2019s blade', 'Melee Weapons'),
    weapon('Tachyon arrow', 'Ranged Weapons'),
    weapon('Hyperphase sword', 'Melee Weapons'),
  ]
  const group = (name: string, ...carried: string[]) => ({ name, options: carried.map((held) => ({ name: held })) })

  it('asks what the unit fights with before what else it carries', () => {
    const choices = [group('Wargear', 'Resurrection orb'), group('Weapons', 'Overlord\u2019s blade', 'Tachyon arrow')]
    expect(orderedChoices(choices, weapons).map((entry) => entry.name)).toEqual(['Weapons', 'Wargear'])
  })

  it('keeps guns ahead of blades, and leaves the rest as the datasheet has them', () => {
    const choices = [
      group('Melee', 'Hyperphase sword'),
      group('Relic', 'Veil of darkness'),
      group('Ranged', 'Tachyon arrow'),
      group('Trinket', 'Phylactery'),
    ]
    expect(orderedChoices(choices, weapons).map((entry) => entry.name)).toEqual(['Ranged', 'Melee', 'Relic', 'Trinket'])
  })

  it('counts a group as weapons when any option in it has a profile', () => {
    // The point of most such groups is that one option is a gun and the other is not.
    const choices = [group('Wargear', 'Resurrection orb'), group('Arm', 'Tachyon arrow', 'Nothing at all')]
    expect(orderedChoices(choices, weapons).map((entry) => entry.name)).toEqual(['Arm', 'Wargear'])
  })
})

describe('a group the whole squad answers at once', () => {
  it('hands every model the option that was picked', () => {
    const group = choice([option('gauss', 5, 5), option('tesla', 0, 5)], 5)
    expect(wholeSquadTakes(group, 'tesla')).toEqual({ gauss: 0, tesla: 5 })
    expect(wholeSquadTakes(group, 'gauss')).toEqual({ gauss: 5, tesla: 0 })
  })
})

describe('dividing a group between its options', () => {
  it('fills the spare room before asking a sibling for anything', () => {
    const group = choice([option('blaster', 3, 10), option('carbine', 0, 10)], 5)
    expect(spreadHandlers(group).more(group.options[1]!)).toEqual({ carbine: 1 })
  })

  it('takes from whichever sibling has the most once the group is full', () => {
    const group = choice([option('blaster', 8, 10), option('carbine', 2, 10)], 10)
    expect(spreadHandlers(group).more(group.options[1]!)).toEqual({ carbine: 3, blaster: 7 })
  })

  it("takes from the group's default before replacing another specialist", () => {
    const boltgun = { ...option('boltgun', 1, 4), default: true }
    const heavy = option('heavy', 2, 2)
    const spewer = option('spewer', 0, 1)
    const group = choice([heavy, boltgun, spewer], 3)

    expect(spreadHandlers(group).more(spewer)).toEqual({ spewer: 1, boltgun: 0 })
    expect([heavy, boltgun].toSorted(donorPriority)[0]).toBe(boltgun)
  })

  it('takes from a minimum that the catalogue changes for its sibling', () => {
    const regular = { ...option('regular', 4, 9), min: 4, mutableMin: true }
    const group = choice([regular, option('specialist', 0, 2)], 4)

    expect(spreadHandlers(group).more(group.options[1]!)).toEqual({ specialist: 1, regular: 3 })
  })

  it("refuses to exceed an option's own cap", () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).more(group.options[1]!)).toBeNull()
  })

  it('hands a freed place to a sibling still under its cap', () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1]!)).toEqual({ special: 0, blaster: 10 })
  })

  it('refuses to empty an option when no sibling can take its place', () => {
    const group = choice([option('blaster', 9, 9), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1]!)).toBeNull()
  })

  it('simply removes one when the group may hold fewer', () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10, true)
    expect(spreadHandlers(group).less(group.options[1]!)).toEqual({ special: 0 })
  })

  it('has nothing to remove from an empty option', () => {
    const group = choice([option('blaster', 10, 10), option('special', 0, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1]!)).toBeNull()
  })
})

describe('putting a weapon down on a model card', () => {
  const card = (rows: LoadoutModel['rows'], members: LoadoutModel['members'] = []): LoadoutModel => ({
    name: 'Card',
    fixed: [],
    members,
    rows,
  })
  const rowFor = (id: string, name = id) => ({ name, choiceKey: 'group', optionId: id })

  it('replaces a melee loadout with a ranged pairing from the same choice', () => {
    const group = { ...choice([option('axe', 1, 2), option('pair', 0, 2)], 2), carried: true }
    const model = card(
      [rowFor('axe'), { ...rowFor('pair'), pieces: ['Rifle', 'Blade'] }],
      [{ id: 'leader', choiceKey: null, baseCount: 1 }],
    )
    expect(poolHandlers(model, [group], [weapon('axe', 'Melee Weapons'), weapon('Rifle', 'Ranged Weapons')]).spend(model.rows[1]!)).toEqual(
      [['group', { axe: 0, pair: 1 }]],
    )
  })

  it('leaves the squad an ordinary model where the group holds nothing but specialists', () => {
    const group = choice([option('meltagun', 1, 2), option('plasma', 1, 2), option('belcher', 0, 2)], 2, true)
    const model = card([rowFor('meltagun'), rowFor('plasma'), rowFor('belcher')])

    expect(poolHandlers(model, [group], []).free(model.rows[0]!)).toEqual([['group', { meltagun: 0 }]])
  })

  it('hands the freed place back to the loadout the squad starts with', () => {
    const rifle = { ...option('rifle', 2, 3), default: true }
    const group = choice([rifle, option('melta', 1, 1)], 3, true)
    const model = card([rowFor('rifle'), rowFor('melta')])

    expect(poolHandlers(model, [group], []).free(model.rows[1]!)).toEqual([['group', { melta: 0, rifle: 3 }]])
  })

  it('hands the freed place to a sibling where the group has to stay full', () => {
    const group = choice([option('ordinary', 2, 3), option('special', 1, 3)], 3)
    const model = card([rowFor('ordinary'), rowFor('special')])

    expect(poolHandlers(model, [group], []).free(model.rows[1]!)).toEqual([['group', { special: 0, ordinary: 3 }]])
  })

  it('has nothing to put down on an empty row', () => {
    const group = choice([option('meltagun', 0, 2), option('plasma', 1, 2)], 2, true)
    const model = card([rowFor('meltagun'), rowFor('plasma')])

    expect(poolHandlers(model, [group], []).free(model.rows[0]!)).toBeNull()
  })

  it('counts the models a card stands for from the choices its members point at', () => {
    const group = choice([option('meltagun', 1, 2), option('plasma', 1, 2)], 2, true)
    const model = card(
      [rowFor('meltagun'), rowFor('plasma')],
      [
        { id: 'meltagun', choiceKey: 'group', baseCount: 0 },
        { id: 'plasma', choiceKey: 'group', baseCount: 0 },
      ],
    )

    expect(modelCount(model, [group])).toBe(2)
  })
})

it('keeps default and fixed wargear before alternatives even after they are replaced', () => {
  const model: LoadoutModel = {
    name: 'Trooper',
    members: [],
    fixed: [{ name: 'Combat knife', count: 0 }],
    rows: [
      { name: 'Plasma pistol', choiceKey: 'group', optionId: 'pistol' },
      { name: 'Bolt carbine', choiceKey: 'group', optionId: 'carbine' },
    ],
  }
  const choices = [
    choice(
      [
        { ...option('pistol', 1, 1), name: 'Plasma pistol' },
        { ...option('carbine', 0, 1), name: 'Bolt carbine', default: true },
      ],
      1,
    ),
  ]
  const weapons = [
    weapon('Plasma pistol', 'Ranged Weapons'),
    weapon('Bolt carbine', 'Ranged Weapons'),
    weapon('Combat knife', 'Melee Weapons'),
  ]
  expect(orderedModelWargear(model, choices, weapons).map((entry) => entry.name)).toEqual(['Bolt carbine', 'Combat knife', 'Plasma pistol'])
})

it.each([
  ['spend', 0, 1],
  ['free', 1, 0],
] as const)('%s changes only an optional nested weapon, leaving its parent and other weapon slots intact', (action, count, expected) => {
  const gun = { name: 'Gun', choiceKey: 'loadout/pair/guns', optionId: 'gun' }
  const model: LoadoutModel = {
    name: 'Leader',
    fixed: [],
    members: [{ id: 'leader', choiceKey: null, baseCount: 1 }],
    rows: [
      { name: 'Blade and Gun', pieces: ['Blade', 'Gun'], choiceKey: 'loadout', optionId: 'pair' },
      { name: 'Blade', choiceKey: 'loadout/pair/blades', optionId: 'blade' },
      gun,
    ],
  }
  const choices = [
    { ...choice([{ ...option('pair', 1, 2), default: true }], 2), key: 'loadout' },
    { ...choice([{ ...option('blade', 0, 2), default: true }], 2), key: 'loadout/pair/blades' },
    { ...choice([{ ...option('gun', count, 2), default: true }], 2, true), key: gun.choiceKey },
  ]
  expect(poolHandlers(model, choices, [weapon('Gun', 'Ranged Weapons'), weapon('Blade', 'Melee Weapons')])[action](gun)).toEqual([
    [gun.choiceKey, { gun: expected }],
  ])
})

it.each([true, false])('cannot empty a required weapon slot with default=%s', (isDefault) => {
  const row = { name: 'Blade', choiceKey: 'weapons', optionId: 'blade' }
  const model: LoadoutModel = { name: 'Leader', fixed: [], members: [{ id: 'leader', choiceKey: null, baseCount: 1 }], rows: [row] }
  const group = { ...choice([{ ...option('blade', 1, 2), default: isDefault }], 2), key: row.choiceKey }
  expect(poolHandlers(model, [group], []).free(row)).toBeNull()
})

it('returns a required replacement to the default weapon without emptying the slot', () => {
  const rows = [
    { name: 'Blade', choiceKey: 'weapons', optionId: 'blade' },
    { name: 'Axe', choiceKey: 'weapons', optionId: 'axe' },
  ]
  const model: LoadoutModel = { name: 'Leader', fixed: [], members: [{ id: 'leader', choiceKey: null, baseCount: 1 }], rows }
  const group = { ...choice([{ ...option('blade', 0, 2), default: true }, option('axe', 1, 2)], 2), key: 'weapons' }
  expect(poolHandlers(model, [group], []).free(rows[1]!)).toEqual([['weapons', { axe: 0, blade: 1 }]])
})
