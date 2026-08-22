import { describe, expect, it } from 'vitest'
import {
  type LoadoutChoice,
  ordered,
  orderedChoices,
  sameWeapon,
  showLoadoutEntry,
  spreadHandlers,
  weaponMatches,
  wargearMatches,
  wholeSquadTakes,
} from './loadoutModel'

const option = (id: string, count: number, max: number) => ({ id, name: id, points: 0, count, max })

const choice = (options: LoadoutChoice['options'], room: number, optional = false): LoadoutChoice => ({
  key: 'group',
  name: 'Group',
  chosen: '',
  optional,
  carried: false,
  room,
  uniform: false,
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

describe('matching a wargear name to what describes it', () => {
  it('reads a parenthesised mode as the same weapon', () => {
    expect(sameWeapon('Staff of light', 'Staff of light (Melee)')).toBe(true)
    expect(sameWeapon('Staff of light (Ranged)', 'Staff of light (Melee)')).toBe(true)
  })

  it('keeps two different weapons apart', () => {
    expect(sameWeapon('Gauss flayer', 'Gauss reaper')).toBe(false)
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

  it('matches a rule the same way a profile is matched', () => {
    expect(wargearMatches('Storm shield', 'Storm shield')).toBe(true)
    expect(wargearMatches('Storm shield and thunder hammer', 'Storm shield')).toBe(true)
    expect(wargearMatches('Storm shield', 'Iron halo')).toBe(false)
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
