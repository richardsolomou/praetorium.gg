import type { Repository } from '../../db/repository'
import { PLAYER_SEARCH_MIN_LENGTH } from '../../core/playerSearch'

export class SocialService {
  constructor(
    private readonly repository: Repository,
    private readonly clock: () => number,
  ) {}

  /**
   * The players this one may open a battle with: their friends, and the practice
   * opponents the instance seats.
   *
   * One list rather than two, because `createBattle` asks exactly this question of
   * exactly this answer. Splitting them would put a second rule about who may be
   * in a battle next to the first, and the two would eventually disagree.
   *
   * Asked for on its own rather than taken out of the friends page, because the
   * page also offers strangers to invite — and reaching for that here put a scan
   * of every account on the instance behind every battle opened and every link
   * followed, to answer a question about a handful of rows.
   */
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
  }

  async acceptFriend(userId: string, requesterId: string) {
    if (!(await this.repository.acceptFriend(requesterId, userId, this.clock())))
      throw new Response('no such friend request', { status: 404 })
  }

  async removeFriend(userId: string, friendId: string) {
    if (!(await this.repository.removeFriend(userId, friendId))) throw new Response('no such friendship', { status: 404 })
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
