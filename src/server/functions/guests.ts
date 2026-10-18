import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { heldGuestSeat, holdGuestSeat, releaseGuestSeat } from '../guestSession'
import { mutationRpc, rpc } from '../rpc'
import { guestInvitationSchema, guestInviteSchema, tokenSchema } from '../../contracts/schemas'

/** The link and QR code a seated account shows its guest, and whether a device has taken the seat. */
export const guestInvite = createServerFn({ method: 'POST' })
  .validator(guestInviteSchema)
  .handler(({ data }) => mutationRpc(async () => app().service.guestInvite(data.token, await requireUserId(), data.playerId, data.replace)))

/** What a guest's link offers, read before they choose to join on this device. */
export const guestInvitation = createServerFn({ method: 'GET' })
  .validator(guestInvitationSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const invitation = await app().service.guestInvitation(data.invite)
      if (!invitation) return null
      const held = await heldGuestSeat(invitation.token)
      return { ...invitation, here: held?.seat === invitation.seatId }
    }),
  )

/** Takes the guest seat on this device, which keeps the only copy of its secret in an HTTP-only cookie. */
export const joinGuest = createServerFn({ method: 'POST' })
  .validator(guestInvitationSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const invitation = await app().service.guestInvitation(data.invite)
      if (invitation && (await heldGuestSeat(invitation.token))?.seat === invitation.seatId) return { token: invitation.token }
      const joined = await app().service.joinGuest(data.invite, await currentUserId())
      holdGuestSeat({ token: joined.token, seat: joined.seatId, secret: joined.secret })
      return { token: joined.token }
    }),
  )

/** Moves the guest seat this device played onto the signed-in account, and forgets the guest session it no longer needs. */
export const claimGuest = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const held = await heldGuestSeat(data.token)
      if (!held) throw new Response('this device is not playing a guest seat in that battle', { status: 403 })
      await app().service.claimGuest(data.token, userId, held)
      releaseGuestSeat(held.seat)
    }),
  )
