import { describe, expect, it } from 'vitest'
import { battleAudience, DEFAULT_BATTLE_AUDIENCE, maySpectate, narrower } from './battleAudience'

describe('battleAudience', () => {
  it('treats a player who has never answered as the default', () => {
    expect(battleAudience([undefined, undefined])).toBe(DEFAULT_BATTLE_AUDIENCE)
  })

  it('takes the narrowest answer at the table', () => {
    expect(battleAudience(['public', 'friends'])).toBe('friends')
    expect(battleAudience(['friends', 'private'])).toBe('private')
    expect(battleAudience(['public', 'public', 'private', 'public'])).toBe('private')
  })

  it('lets one player withhold a battle everyone else would have shared', () => {
    expect(battleAudience([undefined, 'private'])).toBe('private')
  })

  it('shows nobody a battle with nobody in it', () => {
    expect(battleAudience([])).toBe('private')
  })
})

describe('narrower', () => {
  it('is the same answer whichever order the two arrive in', () => {
    expect(narrower('public', 'friends')).toBe('friends')
    expect(narrower('friends', 'public')).toBe('friends')
  })
})

describe('maySpectate', () => {
  it('lets anyone watch a public battle, signed in or not', () => {
    expect(maySpectate('public', { signedIn: false, friend: false })).toBe(true)
    expect(maySpectate('public', { signedIn: true, friend: false })).toBe(true)
  })

  it('lets nobody outside the seats watch a private battle', () => {
    expect(maySpectate('private', { signedIn: true, friend: true })).toBe(false)
  })

  it('lets only a friend watch a battle shared with friends', () => {
    expect(maySpectate('friends', { signedIn: true, friend: true })).toBe(true)
    expect(maySpectate('friends', { signedIn: true, friend: false })).toBe(false)
    expect(maySpectate('friends', { signedIn: false, friend: false })).toBe(false)
  })
})
