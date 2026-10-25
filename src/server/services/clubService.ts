import { randomId, randomToken } from 'ras-stack/auth'
import { isClubOrganizer, visibleClubMembers } from '../../core/club'
import type { LeagueAdmission, LeagueVisibility } from '../../core/league'
import type { Notifier } from '../pushNotifier'
import type { RepositoryPort } from '../spacetimeRepository'

type ClubDetails = { name: string; description: string; visibility: LeagueVisibility; admission: LeagueAdmission }

export class ClubService {
  constructor(
    private readonly repository: RepositoryPort,
    private readonly clock: () => number,
    private readonly notifier: Notifier,
  ) {}

  async createClub(ownerId: string, details: ClubDetails) {
    const token = randomToken()
    await this.repository.createClub({ id: randomId(), token, ownerId, ...details, now: this.clock() })
    return { token }
  }

  async updateClub(token: string, actorId: string, details: ClubDetails) {
    const result = await this.repository.updateClub(token, actorId, details)
    if (typeof result === 'object') {
      if (result.admitted.length)
        this.notifier.notify([{ kind: 'club-member-accepted', actorId, recipientIds: result.admitted, clubToken: token }])
      return
    }
    if (result === 'missing') throw new Response('no such club', { status: 404 })
    throw new Response('only the club’s organizers can edit it', { status: 403 })
  }

  async deleteClub(token: string, actorId: string) {
    const result = await this.repository.deleteClub(token, actorId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('no such club', { status: 404 })
    throw new Response('only the club’s owner can delete it', { status: 403 })
  }

  async joinClub(token: string, userId: string) {
    const result = await this.repository.joinClub(token, userId, this.clock())
    if (typeof result === 'object') {
      if (result.organizerIds.length)
        this.notifier.notify([{ kind: 'club-member-requested', actorId: userId, recipientIds: result.organizerIds, clubToken: token }])
      return result.status
    }
    if (result === 'missing') throw new Response('no such club', { status: 404 })
    throw new Response('this club is full', { status: 409 })
  }

  async leaveClub(token: string, userId: string) {
    const result = await this.repository.leaveClub(token, userId)
    if (result === 'left') return
    if (result === 'missing') throw new Response('you are not in this club', { status: 404 })
    throw new Response('the owner cannot leave their own club', { status: 409 })
  }

  async moderateClubMember(token: string, actorId: string, userId: string, accept: boolean) {
    const result = await this.repository.moderateClubMember(token, actorId, userId, accept)
    if (result === 'accepted') this.notifier.notify([{ kind: 'club-member-accepted', actorId, recipientIds: [userId], clubToken: token }])
    if (result === 'accepted' || result === 'rejected') return result
    if (result === 'missing') throw new Response('no such request to join', { status: 404 })
    throw new Response('only the club’s organizers can answer requests', { status: 403 })
  }

  async removeClubMember(token: string, actorId: string, userId: string) {
    const result = await this.repository.removeClubMember(token, actorId, userId)
    if (result === 'removed') return
    if (result === 'missing') throw new Response('no such member', { status: 404 })
    throw new Response('only the owner can remove an admin, and nobody can remove the owner', { status: 403 })
  }

  async setClubAdmins(token: string, actorId: string, userIds: readonly string[]) {
    const result = await this.repository.setClubAdmins(token, actorId, userIds)
    if (typeof result === 'object') return result
    if (result === 'missing') throw new Response('no such club', { status: 404 })
    if (result === 'forbidden') throw new Response('only the club’s owner can choose its admins', { status: 403 })
    throw new Response('admins must be members of the club', { status: 409 })
  }

  clubs(userId: string | null) {
    return this.repository.clubsVisibleTo(userId)
  }

  async club(token: string, viewerId: string | null) {
    const club = await this.repository.clubByToken(token)
    if (!club) return null
    const organizer = isClubOrganizer(club, club.members, viewerId)
    return { ...club, organizer, members: visibleClubMembers(club.members, organizer, viewerId) }
  }
}
