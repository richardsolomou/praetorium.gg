import { describe, expect, it } from 'vitest'
import { GUEST_SESSION_MS, guestClaimRefusal, guestSessionCurrent, renameSeat } from './guestSession'
import type { LoggedCommand } from './battle'

describe('guest sessions', () => {
  it('keeps a device that joined within the session window', () => {
    expect(guestSessionCurrent(1_000, 1_000 + GUEST_SESSION_MS - 1)).toBe(true)
  })

  it('ends a device session once the window has passed', () => {
    expect(guestSessionCurrent(1_000, 1_000 + GUEST_SESSION_MS)).toBe(false)
  })

  it('does not trust a session that joined in the future', () => {
    expect(guestSessionCurrent(2_000, 1_000)).toBe(false)
  })
})

describe('claiming a guest seat', () => {
  const seats = ['host', 'guest:battle:0']

  it('lets a new account claim a finished battle', () => {
    expect(guestClaimRefusal({ status: 'finished' }, seats, 'newcomer')).toBeNull()
  })

  it('waits for the battle to finish', () => {
    expect(guestClaimRefusal({ status: 'playing' }, seats, 'newcomer')).toBe('finish the battle before adding it to your record')
  })

  it('refuses an account already seated in the battle', () => {
    expect(guestClaimRefusal({ status: 'finished' }, seats, 'host')).toBe('you already have a seat in this battle')
  })
})

describe('renaming a seat', () => {
  const entry: LoggedCommand = {
    seq: 3,
    by: 'guest:battle:0',
    at: 10,
    command: { kind: 'end-battle', reason: 'conceded', concededBy: 'guest:battle:0' },
  }

  it('renames the seat that sent a command', () => {
    expect(renameSeat(entry, 'guest:battle:0', 'newcomer').by).toBe('newcomer')
  })

  it('renames the seat a command names', () => {
    expect(renameSeat(entry, 'guest:battle:0', 'newcomer').command).toEqual({
      kind: 'end-battle',
      reason: 'conceded',
      concededBy: 'newcomer',
    })
  })

  it('leaves text that only mentions the seat alone', () => {
    const note = { kind: 'note', text: 'guest:battle:0 played well' }
    expect(renameSeat(note, 'guest:battle:0', 'newcomer')).toEqual(note)
  })
})
