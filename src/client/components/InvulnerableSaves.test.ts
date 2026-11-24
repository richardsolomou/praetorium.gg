import { expect, it } from 'vitest'
import { shownSaves } from './InvulnerableSaves'

const profile = (value: string, modifiers?: string[]) => ({
  id: 'paladin',
  name: 'Knight Paladin',
  type: 'Unit',
  values: [{ name: 'InSv', value, ...(modifiers ? { modifiers } : {}) }],
})
const typed = [{ profile: 'imperial-knights.knight-paladin', roll: 5, against: 'ranged' as const }]

it('shows VS Data’s typed save in place of the catalogue’s figure', () =>
  expect(shownSaves({ profiles: [profile('5+*')] }, typed).map(({ value, scope }) => [value, scope])).toEqual([
    ['5+', 'Against ranged attacks'],
  ]))

it('shows the catalogue’s figure where VS Data has no save for the unit', () =>
  expect(shownSaves({ profiles: [profile('5+*')] }, undefined).map(({ value }) => value)).toEqual(['5+*']))

it('shows a save the roster grants as the catalogue projects it', () =>
  expect(shownSaves({ profiles: [profile('4+', ['Enhancement'])] }, typed).map(({ value }) => value)).toEqual(['4+']))

it('shows each of a profile’s saves with the attacks it is against', () =>
  expect(
    shownSaves({ profiles: [profile('4+* / 6+')] }, [
      { profile: 'drukhari.wyches', roll: 6, against: 'ranged' },
      { profile: 'drukhari.wyches', roll: 4, against: 'melee' },
    ]).map(({ value, scope }) => [value, scope]),
  ).toEqual([
    ['6+', 'Against ranged attacks'],
    ['4+', 'Against melee attacks'],
  ]))
