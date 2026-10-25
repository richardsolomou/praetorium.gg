import { getCookie, getRequest, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { GUEST_SESSION_MS } from '../core/guestSession'
import { SIGN_IN_REQUIRED } from '../core/session'
import { app } from './app'
import { currentUserId } from './playerSession'

/** The guest seats this browser holds: each battle's token, the seat, and the secret only this device was given. */
const GUEST_COOKIE = 'praetorium-guest'
/** Enough for a player who guests at several tables, small enough to stay one cookie. */
const HELD_SEATS = 8

const heldSeats = z.array(z.object({ token: z.string().max(100), seat: z.string().max(200), secret: z.string().max(100) })).max(HELD_SEATS)
type HeldSeat = z.infer<typeof heldSeats>[number]

export function readHeldSeats(cookie: string | undefined): HeldSeat[] {
  if (!cookie) return []
  try {
    return heldSeats.parse(JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')))
  } catch {
    return []
  }
}

export function encodeHeldSeats(seats: readonly HeldSeat[]) {
  return Buffer.from(JSON.stringify(seats.slice(0, HELD_SEATS))).toString('base64url')
}

function held() {
  return readHeldSeats(getCookie(GUEST_COOKIE))
}

function keep(seats: readonly HeldSeat[]) {
  setCookie(GUEST_COOKIE, encodeHeldSeats(seats), {
    httpOnly: true,
    sameSite: 'lax',
    secure: new URL(getRequest().url).protocol === 'https:',
    path: '/',
    maxAge: GUEST_SESSION_MS / 1000,
  })
}

/** Remembers a seat this device has just joined, newest first, so a full cookie forgets the oldest table. */
export function holdGuestSeat(seat: HeldSeat) {
  keep([seat, ...held().filter((other) => other.seat !== seat.seat)])
}

export function releaseGuestSeat(seat: string) {
  keep(held().filter((other) => other.seat !== seat))
}

/** The guest seat this device holds in the battle, checked against the secret's hash the service kept. */
export async function heldGuestSeat(token: string) {
  for (const seat of held().filter((candidate) => candidate.token === token)) {
    if (await app().service.guestSeat(token, seat)) return seat
  }
  return null
}

/**
 * Who reads or acts in this battle: the guest seat this device joined, else the signed-in account.
 * A guest seat answers only for its own battle, so the cookie grants nothing anywhere else.
 */
export async function battleViewerId(token: string) {
  return (await heldGuestSeat(token))?.seat ?? (await currentUserId())
}

export async function requireBattleActor(token: string) {
  const id = await battleViewerId(token)
  if (!id) throw new Response(SIGN_IN_REQUIRED, { status: 401 })
  return id
}
