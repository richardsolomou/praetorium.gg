import { describe, expect, it } from 'vitest'
import { GUEST_SESSION_MS, claimedLog, guestClaimRefusal, guestSessionCurrent } from './guestSession'
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

describe('reading a claimed seat', () => {
  const log: LoggedCommand[] = [
    { seq: 1, by: 'host', at: 5, command: { kind: 'begin-battle', firstPlayerId: 'guest:battle:0' } },
    { seq: 2, by: 'guest:battle:0', at: 10, command: { kind: 'end-battle', reason: 'conceded', concededBy: 'guest:battle:0' } },
  ]
  const claims = [{ seatId: 'guest:battle:0', userId: 'newcomer' }]

  it('names the claimant as the sender of the guest’s commands', () => {
    expect(claimedLog(log, claims).map((entry) => entry.by)).toEqual(['host', 'newcomer'])
  })

  it('names the claimant wherever a command named the seat', () => {
    expect(claimedLog(log, claims).map((entry) => entry.command)).toEqual([
      { kind: 'begin-battle', firstPlayerId: 'newcomer' },
      { kind: 'end-battle', reason: 'conceded', concededBy: 'newcomer' },
    ])
  })

  it('leaves text that only mentions the seat alone', () => {
    const note = { ...log[0]!, command: { kind: 'note', text: 'guest:battle:0 played well' } } as unknown as LoggedCommand
    expect(claimedLog([note], claims)).toEqual([note])
  })

  it('leaves the log it reads as it was written', () => {
    const written = structuredClone(log)
    claimedLog(log, claims)
    expect(log).toEqual(written)
  })
})
