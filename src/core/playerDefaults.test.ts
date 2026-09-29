import { expect, it } from 'vitest'
import { DEFAULT_PLAYER_DEFAULTS, isPlayerDefaults } from './playerDefaults'

it('accepts the defaults a player starts with', () => {
  expect(isPlayerDefaults(DEFAULT_PLAYER_DEFAULTS)).toBe(true)
})

it('rejects a battle size nobody can create a battle at', () => {
  expect(isPlayerDefaults({ rosterVisibility: 'public', battleSize: 1500 })).toBe(false)
})

it('rejects a visibility a roster cannot have', () => {
  expect(isPlayerDefaults({ rosterVisibility: 'friends', battleSize: 1000 })).toBe(false)
})
