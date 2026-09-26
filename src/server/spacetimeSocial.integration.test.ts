import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { SpacetimeOperator } from './spacetimeOperator'

const url = process.env.SPACETIME_TEST_URL
const database = process.env.SPACETIME_TEST_DATABASE
const token = process.env.SPACETIME_TEST_OPERATOR_TOKEN

it.skipIf(!url || !database || !token)('keeps friendship requests and invite acceptance atomic', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const left = randomUUID()
  const right = randomUUID()
  const now = Date.now()
  try {
    const requested = await Promise.all([operator.requestFriend(left, right, now), operator.requestFriend(right, left, now)])
    expect(new Set(requested)).toEqual(new Set([false, true]))
    const [relationship] = await operator.friendshipsByUser(left)
    expect(relationship).toMatchObject({ acceptedAt: null })
    expect(await operator.acceptFriend(relationship!.requesterId, relationship!.addresseeId, now + 1)).toBe(true)
    expect(await operator.acceptFriend(relationship!.requesterId, relationship!.addresseeId, now + 2)).toBe(false)
    expect(await operator.removeFriend(left, right)).toBe(true)

    const inviteToken = randomUUID()
    await operator.replaceFriendInvite(left, inviteToken, now)
    expect(await operator.friendInviteByToken(inviteToken)).toEqual({ token: inviteToken, inviterId: left })
    expect(await operator.acceptFriendInvite(inviteToken, right, now + 3)).toEqual({ inviterId: left })
    expect(await operator.friendInviteByInviter(left)).toBeNull()
    expect((await operator.friendshipsByUser(right))[0]).toMatchObject({ acceptedAt: now + 3 })
  } finally {
    await operator.deleteUserData(left)
    await operator.deleteUserData(right)
  }
})

it.skipIf(!url || !database || !token)('rejects only a pending request from the named requester', async () => {
  const operator = new SpacetimeOperator(url!, database!, token!)
  const requester = randomUUID()
  const addressee = randomUUID()
  const now = Date.now()
  try {
    expect(await operator.requestFriend(requester, addressee, now)).toBe(true)
    expect(await operator.rejectFriend(addressee, requester)).toBe(false)
    expect(await operator.rejectFriend(requester, addressee)).toBe(true)
    expect(await operator.rejectFriend(requester, addressee)).toBe(false)
    expect(await operator.requestFriend(requester, addressee, now + 1)).toBe(true)
    expect(await operator.acceptFriend(requester, addressee, now + 2)).toBe(true)
    expect(await operator.rejectFriend(requester, addressee)).toBe(false)
    expect((await operator.friendshipsByUser(requester))[0]).toMatchObject({ acceptedAt: now + 2 })
  } finally {
    await operator.deleteUserData(requester)
    await operator.deleteUserData(addressee)
  }
})
