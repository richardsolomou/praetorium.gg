import { randomInt } from 'node:crypto'
import { randomId, randomToken } from 'ras-stack/auth'
import { isGroupOrganizer, visibleGroupMembers } from '../../core/group'
import { GROUP_LEAGUE_PLAYERS_MAX, GROUP_LEAGUE_PLAYERS_MIN, GROUP_LEAGUE_SEED_MAX } from '../../core/groupLeague'
import type { SealedEventAdmission, SealedEventVisibility } from '../../core/sealedEvent'
import type { Notifier } from '../pushNotifier'
import type { RepositoryPort } from '../spacetimeRepository'

type GroupDetails = { name: string; description: string; visibility: SealedEventVisibility; admission: SealedEventAdmission }

export class GroupService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly notifier: Notifier,
  ) {}

  async createGroup(ownerId: string, details: GroupDetails) {
    const token = randomToken()
    await this.repository.createGroup({ id: randomId(), token, ownerId, ...details, now: this.clock() })
    return { token }
  }

  async updateGroup(token: string, actorId: string, details: GroupDetails) {
    const result = await this.repository.updateGroup(token, actorId, details)
    if (typeof result === 'object') {
      if (result.admitted.length)
        this.notifier.notify([{ kind: 'group-member-accepted', actorId, recipientIds: result.admitted, groupToken: token }])
      return
    }
    if (result === 'missing') throw new Response('no such group', { status: 404 })
    throw new Response('only the group’s organizers can edit it', { status: 403 })
  }

  async deleteGroup(token: string, actorId: string) {
    const result = await this.repository.deleteGroup(token, actorId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('no such group', { status: 404 })
    throw new Response('only the group’s owner can delete it', { status: 403 })
  }

  async joinGroup(token: string, userId: string) {
    const result = await this.repository.joinGroup(token, userId, this.clock())
    if (typeof result === 'object') {
      if (result.organizerIds.length)
        this.notifier.notify([{ kind: 'group-member-requested', actorId: userId, recipientIds: result.organizerIds, groupToken: token }])
      return result.status
    }
    if (result === 'missing') throw new Response('no such group', { status: 404 })
    throw new Response('this group is full', { status: 409 })
  }

  async leaveGroup(token: string, userId: string) {
    const result = await this.repository.leaveGroup(token, userId)
    if (result === 'left') return
    if (result === 'missing') throw new Response('you are not in this group', { status: 404 })
    throw new Response('the owner cannot leave their own group', { status: 409 })
  }

  async moderateGroupMember(token: string, actorId: string, userId: string, accept: boolean) {
    const result = await this.repository.moderateGroupMember(token, actorId, userId, accept)
    if (result === 'accepted') this.notifier.notify([{ kind: 'group-member-accepted', actorId, recipientIds: [userId], groupToken: token }])
    if (result === 'accepted' || result === 'rejected') return result
    if (result === 'missing') throw new Response('no such request to join', { status: 404 })
    throw new Response('only the group’s organizers can answer requests', { status: 403 })
  }

  async removeGroupMember(token: string, actorId: string, userId: string) {
    const result = await this.repository.removeGroupMember(token, actorId, userId)
    if (result === 'removed') return
    if (result === 'missing') throw new Response('no such member', { status: 404 })
    throw new Response('only the owner can remove an admin, and nobody can remove the owner', { status: 403 })
  }

  async setGroupAdmins(token: string, actorId: string, userIds: readonly string[]) {
    const result = await this.repository.setGroupAdmins(token, actorId, userIds)
    if (typeof result === 'object') return result
    if (result === 'missing') throw new Response('no such group', { status: 404 })
    if (result === 'forbidden') throw new Response('only the group’s owner can choose its admins', { status: 403 })
    throw new Response('admins must be members of the group', { status: 409 })
  }

  async joinLeague(token: string, userId: string) {
    const result = await this.repository.joinGroupLeague(token, userId, this.clock())
    if (result === 'joined') return
    if (result === 'missing') throw new Response('this group has no league to join', { status: 404 })
    if (result === 'forbidden') throw new Response('only the group’s members can join its league', { status: 403 })
    if (result === 'full') throw new Response(`a league has at most ${GROUP_LEAGUE_PLAYERS_MAX} players`, { status: 409 })
    throw new Response('the league has started, so nobody else can join it', { status: 409 })
  }

  async leaveLeague(token: string, userId: string) {
    if ((await this.repository.leaveGroupLeague(token, userId)) === 'missing')
      throw new Response('you are not playing in this league', { status: 404 })
  }

  /** Starts a draft league, or draws a draft's fixtures again. */
  async drawLeague(token: string, actorId: string) {
    const result = await this.repository.drawGroupLeague(token, actorId, {
      id: randomId(),
      seed: randomInt(GROUP_LEAGUE_SEED_MAX + 1),
      now: this.clock(),
    })
    if (result === 'drawn') return
    if (result === 'missing') throw new Response('no such group', { status: 404 })
    if (result === 'forbidden') throw new Response('only the group’s organizers can run a league', { status: 403 })
    throw new Response('a published league cannot be drawn again', { status: 409 })
  }

  async publishLeague(token: string, actorId: string, draw: { seed: number; playerIds: readonly string[] }) {
    const result = await this.repository.publishGroupLeague(token, actorId, { ...draw, now: this.clock() })
    if (result === 'published') return
    if (result === 'missing') throw new Response('this group has no league', { status: 404 })
    if (result === 'forbidden') throw new Response('only the group’s organizers can publish a league', { status: 403 })
    if (result === 'too-few') throw new Response(`a league needs at least ${GROUP_LEAGUE_PLAYERS_MIN} players`, { status: 409 })
    throw new Response('the draw changed while you were reviewing it; check it again', { status: 409 })
  }

  async setLeagueDeadline(token: string, actorId: string, round: number, deadline: number | null) {
    const result = await this.repository.setGroupLeagueDeadline(token, actorId, round, deadline)
    if (result === 'set') return
    if (result === 'missing') throw new Response('no such round', { status: 404 })
    throw new Response('only the group’s organizers can set deadlines', { status: 403 })
  }

  async deleteLeague(token: string, actorId: string) {
    const result = await this.repository.deleteGroupLeague(token, actorId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('this group has no league', { status: 404 })
    throw new Response('only the group’s organizers can end a league', { status: 403 })
  }

  groups(userId: string | null) {
    return this.repository.groupsVisibleTo(userId)
  }

  async group(token: string, viewerId: string | null) {
    return (await this.groupWithLeague(token, viewerId))?.group ?? null
  }

  /** The group as `group` reads it, and its league for the reads that check or present one. */
  async groupWithLeague(token: string, viewerId: string | null) {
    const record = await this.repository.groupByToken(token)
    if (!record) return null
    const { league, ...group } = record
    const organizer = isGroupOrganizer(group, group.members, viewerId)
    return { group: { ...group, organizer, members: visibleGroupMembers(group.members, organizer, viewerId) }, league }
  }
}
