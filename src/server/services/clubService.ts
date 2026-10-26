import { randomInt } from 'node:crypto'
import { randomId, randomToken } from 'ras-stack/auth'
import { isClubOrganizer, visibleClubMembers } from '../../core/club'
import { CLUB_SEASON_PLAYERS_MAX, CLUB_SEASON_PLAYERS_MIN, CLUB_SEASON_SEED_MAX } from '../../core/clubSeason'
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

  async joinSeason(token: string, userId: string) {
    const result = await this.repository.joinClubSeason(token, userId, this.clock())
    if (result === 'joined') return
    if (result === 'missing') throw new Response('this club has no season to join', { status: 404 })
    if (result === 'forbidden') throw new Response('only the club’s members can join its season', { status: 403 })
    if (result === 'full') throw new Response(`a season has at most ${CLUB_SEASON_PLAYERS_MAX} players`, { status: 409 })
    throw new Response('the season has started, so nobody else can join it', { status: 409 })
  }

  async leaveSeason(token: string, userId: string) {
    if ((await this.repository.leaveClubSeason(token, userId)) === 'missing')
      throw new Response('you are not playing in this season', { status: 404 })
  }

  /** Starts a draft season, or draws a draft's fixtures again. */
  async drawSeason(token: string, actorId: string) {
    const result = await this.repository.drawClubSeason(token, actorId, {
      seasonId: randomId(),
      seed: randomInt(CLUB_SEASON_SEED_MAX + 1),
      now: this.clock(),
    })
    if (result === 'drawn') return
    if (result === 'missing') throw new Response('no such club', { status: 404 })
    if (result === 'forbidden') throw new Response('only the club’s organizers can run a season', { status: 403 })
    throw new Response('a published season cannot be drawn again', { status: 409 })
  }

  async publishSeason(token: string, actorId: string, draw: { seed: number; playerIds: readonly string[] }) {
    const result = await this.repository.publishClubSeason(token, actorId, { ...draw, now: this.clock() })
    if (result === 'published') return
    if (result === 'missing') throw new Response('this club has no season', { status: 404 })
    if (result === 'forbidden') throw new Response('only the club’s organizers can publish a season', { status: 403 })
    if (result === 'too-few') throw new Response(`a season needs at least ${CLUB_SEASON_PLAYERS_MIN} players`, { status: 409 })
    throw new Response('the draw changed while you were reviewing it; check it again', { status: 409 })
  }

  async setSeasonDeadline(token: string, actorId: string, round: number, deadline: number | null) {
    const result = await this.repository.setClubSeasonDeadline(token, actorId, round, deadline)
    if (result === 'set') return
    if (result === 'missing') throw new Response('no such round', { status: 404 })
    throw new Response('only the club’s organizers can set deadlines', { status: 403 })
  }

  async deleteSeason(token: string, actorId: string) {
    const result = await this.repository.deleteClubSeason(token, actorId)
    if (result === 'deleted') return
    if (result === 'missing') throw new Response('this club has no season', { status: 404 })
    throw new Response('only the club’s organizers can end a season', { status: 403 })
  }

  clubs(userId: string | null) {
    return this.repository.clubsVisibleTo(userId)
  }

  async club(token: string, viewerId: string | null) {
    return (await this.clubWithSeason(token, viewerId))?.club ?? null
  }

  /** The club as `club` reads it, and its season for the reads that check or present one. */
  async clubWithSeason(token: string, viewerId: string | null) {
    const record = await this.repository.clubByToken(token)
    if (!record) return null
    const { season, ...club } = record
    const organizer = isClubOrganizer(club, club.members, viewerId)
    return { club: { ...club, organizer, members: visibleClubMembers(club.members, organizer, viewerId) }, season }
  }
}
