import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import {
  clubMemberSchema,
  createClubSchema,
  moderateClubMemberSchema,
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

export const battleClubs = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.battleClubs(data.token, await currentUserId())))

export const createClub = createServerFn({ method: 'POST' })
  .validator(createClubSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.clubService.createClub(player.id, data)
      await app().telemetry.capture(player.id, 'club_created', { visibility: data.visibility, admission: data.admission })
      return result
    }),
  )

export const updateClub = createServerFn({ method: 'POST' })
  .validator(updateClubSchema)
  .handler(({ data: { token, ...details } }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return app().service.clubService.updateClub(token, player.id, details)
    }),
  )

export const deleteClub = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.clubService.deleteClub(data.token, player.id)
      await app().telemetry.capture(player.id, 'club_deleted')
    }),
  )

export const joinClub = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const status = await app().service.clubService.joinClub(data.token, player.id)
      await app().telemetry.capture(player.id, 'club_joined', { status })
      return status
    }),
  )

export const leaveClub = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.clubService.leaveClub(data.token, player.id)
      await app().telemetry.capture(player.id, 'club_left')
    }),
  )

export const moderateClubMember = createServerFn({ method: 'POST' })
  .validator(moderateClubMemberSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.clubService.moderateClubMember(data.token, player.id, data.userId, data.accept)
      await app().telemetry.capture(player.id, 'club_member_moderated', { result })
      return result
    }),
  )

export const removeClubMember = createServerFn({ method: 'POST' })
  .validator(clubMemberSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      await app().service.clubService.removeClubMember(data.token, player.id, data.userId)
    }),
  )

export const setClubAdmins = createServerFn({ method: 'POST' })
  .validator(setClubAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.clubService.setClubAdmins(data.token, player.id, data.userIds)
      await app().telemetry.capture(player.id, 'club_admins_set', { admins: data.userIds.length })
      return result
    }),
  )
