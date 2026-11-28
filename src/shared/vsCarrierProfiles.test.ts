import { expect, it } from 'vitest'
import type { CombatCarrier } from '../core/combatLoadout'
import { vsCarriersFiring } from './vsCarrierProfiles'

const profile = (id: string, name: string) => ({ id, name, type: 'Melee Weapons', values: [] })
const carrying = (...names: string[]): CombatCarrier[] => [{ name: 'Model', models: 1, weapons: names.map((name) => ({ name, count: 1 })) }]
const fires = (carriers: CombatCarrier[], profiles: ReturnType<typeof profile>[], catalogue: CombatCarrier[] = []) =>
  vsCarriersFiring(carriers, profiles, catalogue)[0]!.weapons.map((weapon) => weapon.profileIds)

it('fires a weapon VS Data spells otherwise through the reviewed spellings', () => {
  expect(fires(carrying('Twin Power Fists'), [profile('fist', 'Twin power fist')])).toEqual([['fist']])
})

it('fires a weapon whose name only one source prints with a leading article', () => {
  expect(fires(carrying('The Staff of Ulthamar and witchblade'), [profile('staff', 'Staff of Ulthamar and witchblade')])).toEqual([
    ['staff'],
  ])
})

it('fires a weapon no profile is named for as the catalogue carrier of that name does', () => {
  const catalogue = [{ name: 'Librarian', models: 1, weapons: [{ name: 'Force weapon', count: 1, profileIds: ['sword'] }] }]
  expect(fires(carrying('Force Weapon'), [profile('sword', 'Force sword')], catalogue)).toEqual([['sword']])
})

it('keeps a model fighting with the weapon the datasheet prints first where the catalogue holds none', () => {
  const weapons = vsCarriersFiring(carrying('Second', 'First'), [profile('first', 'First'), profile('second', 'Second')], [])[0]!.weapons
  expect(weapons.map((weapon) => weapon.name)).toEqual(['First', 'Second'])
})

it('fires the copy of a weapon the catalogue gives its own model', () => {
  const catalogue = [{ name: 'Model', models: 1, weapons: [{ name: 'Blade', count: 1, profileIds: ['superior'] }] }]
  expect(fires(carrying('Blade'), [profile('trooper', 'Blade'), profile('superior', 'Blade')], catalogue)).toEqual([['superior']])
})

it('finds the catalogue carrier of a model one source names in the plural', () => {
  const catalogue = [{ name: 'Models', models: 2, weapons: [{ name: 'Blade', count: 2, profileIds: ['trooper'] }] }]
  expect(fires(carrying('Blade'), [profile('trooper', 'Blade'), profile('superior', 'Blade')], catalogue)).toEqual([['trooper']])
})
