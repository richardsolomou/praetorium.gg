import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { captureMutation } from '../mutationTelemetry'
import {
  clubMemberSchema,
  clubSeasonDeadlineSchema,
  createClubSchema,
  moderateClubMemberSchema,
  publishClubSeasonSchema,
  setClubAdminsSchema,
  tokenSchema,
  updateClubSchema,
} from '../../contracts/schemas'

export const listClubs = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.clubService.clubs(await currentUserId())),
)

export const openClub = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.clubService.club(data.token, await currentUserId())))

export const clubStandings = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.clubStandings(data.token, await currentUserId(), await app().battleFactionsFor())))

export const clubSeason = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.clubSeason(data.token, await currentUserId(), await app().battleFactionsFor())))

export const drawClubSeason = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.drawSeason(data.token, userId)
      await captureMutation(userId, 'club_season_drawn')
    }),
  )

export const publishClubSeason = createServerFn({ method: 'POST' })
  .validator(publishClubSeasonSchema)
  .handler(({ data: { token, ...draw } }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.publishSeason(token, userId, draw)
      await app().telemetry.capture(userId, 'club_season_published', { players: draw.playerIds.length })
    }),
  )

export const setClubSeasonDeadline = createServerFn({ method: 'POST' })
  .validator(clubSeasonDeadlineSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.setSeasonDeadline(data.token, userId, data.round, data.deadline)
      await captureMutation(userId, 'club_season_deadline_set', { round: data.round, cleared: data.deadline === null })
    }),
  )

export const deleteClubSeason = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.deleteSeason(data.token, userId)
      await captureMutation(userId, 'club_season_deleted')
    }),
  )

export const joinClubSeason = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.joinSeason(data.token, userId)
      await captureMutation(userId, 'club_season_joined')
    }),
  )

export const leaveClubSeason = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.leaveSeason(data.token, userId)
      await captureMutation(userId, 'club_season_left')
    }),
  )

export const battleClubs = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.battleClubs(data.token, await currentUserId())))

export const createClub = createServerFn({ method: 'POST' })
  .validator(createClubSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.clubService.createClub(userId, data)
      await app().telemetry.capture(userId, 'club_created', { visibility: data.visibility, admission: data.admission })
      return result
    }),
  )

export const updateClub = createServerFn({ method: 'POST' })
  .validator(updateClubSchema)
  .handler(({ data: { token, ...details } }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.updateClub(token, userId, details)
      await captureMutation(userId, 'club_updated', { visibility: details.visibility, admission: details.admission })
    }),
  )

export const deleteClub = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.deleteClub(data.token, userId)
      await app().telemetry.capture(userId, 'club_deleted')
    }),
  )

export const joinClub = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const status = await app().service.clubService.joinClub(data.token, userId)
      await app().telemetry.capture(userId, 'club_joined', { status })
      return status
    }),
  )

export const leaveClub = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.leaveClub(data.token, userId)
      await app().telemetry.capture(userId, 'club_left')
    }),
  )

export const moderateClubMember = createServerFn({ method: 'POST' })
  .validator(moderateClubMemberSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.clubService.moderateClubMember(data.token, userId, data.userId, data.accept)
      await app().telemetry.capture(userId, 'club_member_moderated', { result })
      return result
    }),
  )

export const removeClubMember = createServerFn({ method: 'POST' })
  .validator(clubMemberSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.clubService.removeClubMember(data.token, userId, data.userId)
      await captureMutation(userId, 'club_member_removed')
    }),
  )

export const setClubAdmins = createServerFn({ method: 'POST' })
  .validator(setClubAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.clubService.setClubAdmins(data.token, userId, data.userIds)
      await app().telemetry.capture(userId, 'club_admins_set', { admins: data.userIds.length })
      return result
    }),
  )
