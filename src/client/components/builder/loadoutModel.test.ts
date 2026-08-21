import { describe, expect, it } from 'vitest'
import { type LoadoutChoice, ordered, sameWeapon, spreadHandlers, weaponMatches, wargearMatches } from './loadoutModel'

const option = (id: string, count: number, max: number) => ({ id, name: id, points: 0, count, max })

const choice = (options: LoadoutChoice['options'], room: number, optional = false): LoadoutChoice => ({
  key: 'group',
  name: 'Group',
  chosen: '',
  optional,
  carried: false,
  room,
  options,
})

const weapon = (name: string, type: string) => ({ id: name, name, type, values: [] })

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

describe('dividing a group between its options', () => {
  it('fills the spare room before asking a sibling for anything', () => {
    const group = choice([option('blaster', 3, 10), option('carbine', 0, 10)], 5)
    expect(spreadHandlers(group).more(group.options[1])).toEqual({ carbine: 1 })
  })

  it('takes from whichever sibling has the most once the group is full', () => {
    const group = choice([option('blaster', 8, 10), option('carbine', 2, 10)], 10)
    expect(spreadHandlers(group).more(group.options[1])).toEqual({ carbine: 3, blaster: 7 })
  })

  it("refuses to exceed an option's own cap", () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).more(group.options[1])).toBeNull()
  })

  it('hands a freed place to a sibling still under its cap', () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1])).toEqual({ special: 0, blaster: 10 })
  })

  it('refuses to empty an option when no sibling can take its place', () => {
    const group = choice([option('blaster', 9, 9), option('special', 1, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1])).toBeNull()
  })

  it('simply removes one when the group may hold fewer', () => {
    const group = choice([option('blaster', 9, 10), option('special', 1, 1)], 10, true)
    expect(spreadHandlers(group).less(group.options[1])).toEqual({ special: 0 })
  })

  it('has nothing to remove from an empty option', () => {
    const group = choice([option('blaster', 10, 10), option('special', 0, 1)], 10)
    expect(spreadHandlers(group).less(group.options[1])).toBeNull()
  })
})
