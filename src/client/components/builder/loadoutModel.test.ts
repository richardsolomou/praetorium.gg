import { describe, expect, it } from 'vitest'
import {
  canAddPooledOption,
  choiceRemoval,
  controlledProfileCount,
  type LoadoutChoice,
  type LoadoutModel,
  loadoutRowCount,
  ordered,
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
