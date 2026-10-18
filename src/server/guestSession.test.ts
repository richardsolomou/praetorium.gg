import { expect, it } from 'vitest'
import { encodeHeldSeats, readHeldSeats } from './guestSession'

const seat = { token: 'battle-token', seat: 'guest:battle:0', secret: 'secret' }

it('reads back the seats it wrote', () => {
  expect(readHeldSeats(encodeHeldSeats([seat]))).toEqual([seat])
})

it('holds no seat from a cookie it cannot read', () => {
  expect(readHeldSeats('not-a-seat-list')).toEqual([])
})

it('keeps only the newest eight seats', () => {
  const seats = Array.from({ length: 9 }, (_, at) => ({ ...seat, seat: `guest:battle:${at}` }))
  expect(readHeldSeats(encodeHeldSeats(seats)).map((one) => one.seat)).toEqual(seats.slice(0, 8).map((one) => one.seat))
})
