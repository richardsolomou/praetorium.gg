import type { Repository } from '../../db/repository'
import { PLAYER_SEARCH_MIN_LENGTH } from '../../core/playerSearch'
import { randomToken } from 'ras-stack/auth'
import type { Notifier } from '../pushNotifier'

export class SocialService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
    private readonly notifier: Notifier,
  ) {}

  /** Use one opponent list for both battle creation and its picker; friend search can include strangers and must not serve this path. */
  async opponents(userId: string): Promise<{ id: string; name: string; image: string | null; automated: boolean }[]> {
    const [relationships, practice] = await Promise.all([this.repository.relationships(userId), this.repository.practiceOpponents()])
    return [
      ...sortedFriends(relationships, userId).friends.map((friend) => ({ ...friend, automated: false })),
      ...practice.map((opponent) => ({ ...opponent, automated: true })),
    ]
  }

  /**
   * Everyone this player is connected to or waiting on.
   *
   * One query whatever the count, with the other party already named. Strangers
   * are not in it: who else exists is a search, because reading the instance's
   * whole user table to open this page grows with the instance.
   */
  async friendships(userId: string) {
    return sortedFriends(await this.repository.relationships(userId), userId)
  }

  /**
   * The players a typed name could mean, minus everyone it would be pointless to ask.
   *
   * A name too short to narrow anything matches most of the instance, so it is
   * answered with nothing rather than the first page of whoever is there.
   */
  async searchPlayers(userId: string, query: string) {
    const term = query.trim()
    if (term.length < PLAYER_SEARCH_MIN_LENGTH) return []
    return this.repository.searchPlayers(userId, term)
  }

  async requestFriend(userId: string, friendId: string) {
    if (friendId === userId || !(await this.repository.userById(friendId))) throw new Response('choose another player', { status: 400 })
    if (!(await this.repository.requestFriend(userId, friendId, this.clock())))
      throw new Response('a connection already exists', { status: 409 })
    this.notifier.notify([{ kind: 'friend-requested', actorId: userId, recipientIds: [friendId] }])
  }

  async acceptFriend(userId: string, requesterId: string) {
    if (!(await this.repository.acceptFriend(requesterId, userId, this.clock())))
      throw new Response('no such friend request', { status: 404 })
    this.notifier.notify([{ kind: 'friend-accepted', actorId: userId, recipientIds: [requesterId] }])
  }

  async rejectFriend(userId: string, requesterId: string) {
    if (!(await this.repository.rejectFriend(requesterId, userId))) throw new Response('no such friend request', { status: 404 })
  }

  async removeFriend(userId: string, friendId: string) {
    if (!(await this.repository.removeFriend(userId, friendId))) throw new Response('no such friendship', { status: 404 })
  }

  async activeFriendInvite(userId: string) {
    return this.repository.friendInviteByInviter(userId)
  }

  async friendInvite(token: string) {
    const invite = await this.repository.friendInviteByToken(token)
    if (!invite) return null
    return {
      token: invite.token,
      inviter: { id: invite.inviterId, name: invite.inviterName, image: invite.inviterImage },
    }
  }

  async createFriendInvite(userId: string) {
    const token = randomToken()
    await this.repository.replaceFriendInvite(userId, token, this.clock())
    return { token }
  }

  async cancelFriendInvite(userId: string) {
    await this.repository.cancelFriendInvite(userId)
  }

  async acceptFriendInvite(userId: string, token: string) {
    const result = await this.repository.acceptFriendInvite(token, userId, this.clock())
    if (result === 'missing') throw new Response('this invite is no longer available', { status: 404 })
    if (result === 'self') throw new Response('share this invite with another player', { status: 400 })
    if (result === 'already-friends') throw new Response('you are already friends', { status: 409 })
    this.notifier.notify([{ kind: 'friend-accepted', actorId: userId, recipientIds: [result.inviterId] }])
  }
}

export function sortedFriends(relationships: Awaited<ReturnType<Repository['relationships']>>, userId: string) {
  const named = (row: (typeof relationships)[number]) => ({ id: row.otherId, name: row.otherName, image: row.otherImage })
  return {
    friends: relationships.filter((row) => row.acceptedAt !== null).map(named),
    incoming: relationships.filter((row) => row.acceptedAt === null && row.addresseeId === userId).map(named),
    outgoing: relationships.filter((row) => row.acceptedAt === null && row.requesterId === userId).map(named),
  }
}
