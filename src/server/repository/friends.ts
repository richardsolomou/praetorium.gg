import type { SpacetimeOperator } from '../spacetimeOperator'
import { profileOf, type RepositoryBase } from './area'

/** Friendships, friend invites and the matchups a player remembers. */
export function withFriends<B extends RepositoryBase>(Base: B) {
  return class FriendRepository extends Base {
    async relationships(userId: string) {
      const rows = await this.product.friendshipsByUser(userId)
      const otherIds = rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId))
      const profiles = await this.accounts.profilesByIds(otherIds)
      return rows
        .map((row) => {
          const otherId = row.requesterId === userId ? row.addresseeId : row.requesterId
          const profile = profileOf(profiles, otherId, 'Friend')
          return {
            requesterId: row.requesterId,
            addresseeId: row.addresseeId,
            acceptedAt: row.acceptedAt,
            otherId,
            otherName: profile.name,
            otherImage: profile.image,
            otherColour: profile.colour,
          }
        })
        .sort((left, right) => left.otherName.localeCompare(right.otherName))
    }

    requestFriend(...args: Parameters<SpacetimeOperator['requestFriend']>) {
      return this.product.requestFriend(...args)
    }

    acceptFriend(...args: Parameters<SpacetimeOperator['acceptFriend']>) {
      return this.product.acceptFriend(...args)
    }

    rejectFriend(...args: Parameters<SpacetimeOperator['rejectFriend']>) {
      return this.product.rejectFriend(...args)
    }

    removeFriend(...args: Parameters<SpacetimeOperator['removeFriend']>) {
      return this.product.removeFriend(...args)
    }

    async friendInviteByInviter(inviterId: string) {
      const token = await this.product.friendInviteByInviter(inviterId)
      return token ? { token } : null
    }

    async friendInviteByToken(token: string) {
      const invite = await this.product.friendInviteByToken(token)
      if (!invite) return null
      const inviter = await this.accounts.profileByUserId(invite.inviterId)
      if (!inviter) return null
      return { token, inviterId: inviter.id, inviterName: inviter.name, inviterImage: inviter.image, inviterColour: inviter.colour }
    }

    replaceFriendInvite(...args: Parameters<SpacetimeOperator['replaceFriendInvite']>) {
      return this.product.replaceFriendInvite(...args)
    }

    cancelFriendInvite(...args: Parameters<SpacetimeOperator['cancelFriendInvite']>) {
      return this.product.cancelFriendInvite(...args)
    }

    acceptFriendInvite(...args: Parameters<SpacetimeOperator['acceptFriendInvite']>) {
      return this.product.acceptFriendInvite(...args)
    }

    recentMatchupsByUser(...args: Parameters<SpacetimeOperator['recentMatchupsByUser']>) {
      return this.product.recentMatchupsByUser(...args)
    }

    rememberMatchup(...args: Parameters<SpacetimeOperator['rememberMatchup']>) {
      return this.product.rememberMatchup(...args)
    }

    forgetMatchup(...args: Parameters<SpacetimeOperator['forgetMatchup']>) {
      return this.product.forgetMatchup(...args)
    }
  }
}
