import { GROUP_MEMBER_STATUSES } from '../../core/group'
import type { SealedEventAdmission, SealedEventVisibility } from '../../core/sealedEvent'
import { z } from 'zod'
import type { SpacetimeOperator } from '../spacetimeOperator'
import { profileOf, type RepositoryBase } from './area'

/** Groups, their members and their leagues. */
export function withGroups<B extends RepositoryBase>(Base: B) {
  return class GroupRepository extends Base {
    groupNames(...args: Parameters<SpacetimeOperator['groupNames']>) {
      return this.product.groupNames(...args)
    }
  
    createGroup(input: {
      id: string
      token: string
      ownerId: string
      name: string
      description: string
      visibility: SealedEventVisibility
      admission: SealedEventAdmission
      now: number
    }) {
      return this.product.groupCommand({ ...input, op: 'create' }, z.literal('created'))
    }
  
    updateGroup(
      token: string,
      actorId: string,
      input: { name: string; description: string; visibility: SealedEventVisibility; admission: SealedEventAdmission },
    ) {
      return this.product.groupCommand(
        { op: 'update', token, actorId, ...input },
        z.union([z.object({ admitted: z.array(z.string()) }), z.enum(['missing', 'forbidden'])]),
      )
    }
  
    deleteGroup(token: string, actorId: string) {
      return this.product.groupCommand({ op: 'delete', token, actorId }, z.enum(['deleted', 'missing', 'forbidden']))
    }
  
    joinGroup(token: string, userId: string, now: number) {
      return this.product.groupCommand(
        { op: 'join', token, userId, now },
        z.union([z.object({ status: z.enum(GROUP_MEMBER_STATUSES), organizerIds: z.array(z.string()) }), z.enum(['missing', 'full'])]),
      )
    }
  
    leaveGroup(token: string, userId: string) {
      return this.product.groupCommand({ op: 'leave', token, userId }, z.enum(['left', 'missing', 'owner']))
    }
  
    moderateGroupMember(token: string, actorId: string, userId: string, accept: boolean) {
      return this.product.groupCommand(
        { op: 'moderate', token, actorId, userId, accept },
        z.enum(['accepted', 'rejected', 'missing', 'forbidden']),
      )
    }
  
    removeGroupMember(token: string, actorId: string, userId: string) {
      return this.product.groupCommand({ op: 'remove', token, actorId, userId }, z.enum(['removed', 'missing', 'forbidden']))
    }
  
    joinGroupLeague(token: string, userId: string, now: number) {
      return this.product.groupCommand(
        { op: 'league-join', token, userId, now },
        z.enum(['joined', 'missing', 'published', 'forbidden', 'full']),
      )
    }
  
    leaveGroupLeague(token: string, userId: string) {
      return this.product.groupCommand({ op: 'league-leave', token, userId }, z.enum(['left', 'missing']))
    }
  
    drawGroupLeague(token: string, actorId: string, { id, ...input }: { id: string; seed: number; now: number }) {
      return this.product.groupCommand(
        { op: 'league-draw', token, actorId, leagueId: id, ...input },
        z.enum(['drawn', 'missing', 'forbidden', 'published']),
      )
    }
  
    publishGroupLeague(token: string, actorId: string, input: { seed: number; playerIds: readonly string[]; now: number }) {
      return this.product.groupCommand(
        { op: 'league-publish', token, actorId, ...input },
        z.enum(['published', 'missing', 'forbidden', 'stale', 'too-few']),
      )
    }
  
    setGroupLeagueDeadline(token: string, actorId: string, round: number, deadline: number | null) {
      return this.product.groupCommand({ op: 'league-deadline', token, actorId, round, deadline }, z.enum(['set', 'missing', 'forbidden']))
    }
  
    claimLeagueDeadlineReminders() {
      return this.product.claimLeagueDeadlineReminders()
    }
  
    deleteGroupLeague(token: string, actorId: string) {
      return this.product.groupCommand({ op: 'league-delete', token, actorId }, z.enum(['deleted', 'missing', 'forbidden']))
    }
  
    setGroupAdmins(token: string, actorId: string, userIds: readonly string[]) {
      return this.product.groupCommand(
        { op: 'set-admins', token, actorId, userIds },
        z.union([z.object({ added: z.array(z.string()) }), z.enum(['missing', 'forbidden', 'not-members'])]),
      )
    }
  
    async groupByToken(token: string) {
      const record = await this.product.groupByToken(token)
      if (!record) return undefined
      const profiles = await this.accounts.profilesByIds([
        ...record.members.map((member) => member.userId),
        ...(record.league?.players.map((player) => player.userId) ?? []),
        ...record.pastLeagues.flatMap((league) => league.players.map((player) => player.userId)),
      ])
      const owner = profileOf(profiles, record.group.ownerId, 'Group owner')
      const named = <T extends { userId: string }>(people: readonly T[]) =>
        people.flatMap((person) => {
          const profile = profiles.get(person.userId)
          return profile ? [{ ...person, name: profile.name, image: profile.image, colour: profile.colour }] : []
        })
      return {
        ...record.group,
        games: record.games,
        league: record.league && { ...record.league, players: named(record.league.players) },
        battlesRevision: record.battlesRevision,
        pastLeagues: record.pastLeagues.map((league) => ({ ...league, players: named(league.players) })),
        ownerName: owner.name,
        ownerImage: owner.image,
        ownerColour: owner.colour,
        members: named(record.members),
      }
    }
  
    async groupsVisibleTo(userId: string | null) {
      const rows = await this.product.groupsVisibleTo(userId, 100)
      const owners = await this.accounts.profilesByIds(rows.map((row) => row.group.ownerId))
      return rows.map(({ group, adminIds, memberCount, battleCount, lastBattleAt, ownMember }) => {
        const owner = profileOf(owners, group.ownerId, 'Group owner')
        return {
          ...group,
          ownerName: owner.name,
          ownerImage: owner.image,
          ownerColour: owner.colour,
          adminIds,
          memberCount,
          battleCount,
          lastBattleAt,
          ownMember,
        }
      })
    }
  }
}
