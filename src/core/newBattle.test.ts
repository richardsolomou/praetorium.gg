import { describe, expect, it } from 'vitest'
import { guestSeatId, isGuestSeat, isPracticeSeat, newBattleSeats } from './newBattle'

describe('guest seats', () => {
  it('names a guest seat after the battle it sits in', () => {
    expect(guestSeatId('battle', 1)).toBe('guest:battle:1')
  })

  it('recognises a guest seat', () => {
    expect(isGuestSeat(guestSeatId('battle', 0))).toBe(true)
  })

  it('does not take an account for a guest', () => {
    expect(isGuestSeat('practice-opponent-1')).toBe(false)
  })

  it('treats a seat nobody signs in to as practice', () => {
    expect(isPracticeSeat({ id: 'practice-opponent-1', automated: true })).toBe(true)
  })

  it('does not treat a guest as practice', () => {
    expect(isPracticeSeat({ id: guestSeatId('battle', 0), automated: true })).toBe(false)
  })

  it('does not treat a signed-in player as practice', () => {
    expect(isPracticeSeat({ id: 'bob', automated: false })).toBe(false)
  })

  it('reads guest names off a new battle beside the accounts it seats', () => {
    expect(newBattleSeats({ opponentIds: ['bob'], guestNames: ['Alex'] })).toEqual({
      allyIds: [],
      opponentIds: ['bob'],
      guestNames: ['Alex'],
      invited: ['bob'],
    })
  })

  it('reads no guests off a battle that names none', () => {
    expect(newBattleSeats('bob').guestNames).toEqual([])
  })
})
