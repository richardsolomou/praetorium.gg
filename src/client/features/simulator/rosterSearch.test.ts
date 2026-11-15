import { expect, it } from 'vitest'
import { linkedRosterSource } from './rosterSearch'

it.each([
  ['https://praetorium.gg/rosters/roster-1', { id: 'roster-1' }],
  ['/rosters/player-1?battle=battle-1', { battle: { token: 'battle-1', playerId: 'player-1' } }],
  ['https://praetorium.gg/rosters/roster-1/units', null],
  ['https://praetorium.gg/battles/battle-1', null],
  ['https://praetorium.gg/rosters/%E0%A4%A', null],
])('reads %s as the roster it opens', (text, source) => expect(linkedRosterSource(text)).toEqual(source))
