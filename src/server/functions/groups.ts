import { createServerFn } from '@tanstack/react-start'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { captureMutation } from '../mutationTelemetry'
import {
  groupMemberSchema,
  groupLeagueDeadlineSchema,
  createGroupSchema,
  moderateGroupMemberSchema,
  publishGroupLeagueSchema,
  setGroupAdminsSchema,
  tokenSchema,
  updateGroupSchema,
} from '../../contracts/schemas'

export const listGroups = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.groupService.groups(await currentUserId())),
)

export const openGroup = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.groupService.group(data.token, await currentUserId())))

export const groupStandings = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.groupStandings(data.token, await currentUserId(), await app().battleFactionsFor())))

export const groupLeague = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.groupLeague(data.token, await currentUserId(), await app().battleFactionsFor())))

export const drawGroupLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.drawLeague(data.token, userId)
      await captureMutation(userId, 'group_league_drawn')
    }),
  )

export const publishGroupLeague = createServerFn({ method: 'POST' })
  .validator(publishGroupLeagueSchema)
  .handler(({ data: { token, ...draw } }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.publishLeague(token, userId, draw)
      await captureMutation(userId, 'group_league_published', { players: draw.playerIds.length })
    }),
  )

export const setGroupLeagueDeadline = createServerFn({ method: 'POST' })
  .validator(groupLeagueDeadlineSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.setLeagueDeadline(data.token, userId, data.round, data.deadline)
      await captureMutation(userId, 'group_league_deadline_set', { round: data.round, cleared: data.deadline === null })
    }),
  )

export const deleteGroupLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.deleteLeague(data.token, userId)
      await captureMutation(userId, 'group_league_deleted')
    }),
  )

export const joinGroupLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.joinLeague(data.token, userId)
      await captureMutation(userId, 'group_league_joined')
    }),
  )

export const leaveGroupLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.leaveLeague(data.token, userId)
      await captureMutation(userId, 'group_league_left')
    }),
  )

export const battleGroups = createServerFn({ method: 'GET' })
  .validator(tokenSchema)
  .handler(({ data }) => rpc(async () => app().service.battleGroups(data.token, await currentUserId())))

export const createGroup = createServerFn({ method: 'POST' })
  .validator(createGroupSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.groupService.createGroup(userId, data)
      await captureMutation(userId, 'group_created', { visibility: data.visibility, admission: data.admission })
      return result
    }),
  )

export const updateGroup = createServerFn({ method: 'POST' })
  .validator(updateGroupSchema)
  .handler(({ data: { token, ...details } }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.updateGroup(token, userId, details)
      await captureMutation(userId, 'group_updated', { visibility: details.visibility, admission: details.admission })
    }),
  )

export const deleteGroup = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.deleteGroup(data.token, userId)
      await captureMutation(userId, 'group_deleted')
    }),
  )

export const joinGroup = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const status = await app().service.groupService.joinGroup(data.token, userId)
      await captureMutation(userId, 'group_joined', { status })
      return status
    }),
  )

export const leaveGroup = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.leaveGroup(data.token, userId)
      await captureMutation(userId, 'group_left')
    }),
  )

export const moderateGroupMember = createServerFn({ method: 'POST' })
  .validator(moderateGroupMemberSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.groupService.moderateGroupMember(data.token, userId, data.userId, data.accept)
      await captureMutation(userId, 'group_member_moderated', { result })
      return result
    }),
  )

export const removeGroupMember = createServerFn({ method: 'POST' })
  .validator(groupMemberSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.groupService.removeGroupMember(data.token, userId, data.userId)
      await captureMutation(userId, 'group_member_removed')
    }),
  )

export const setGroupAdmins = createServerFn({ method: 'POST' })
  .validator(setGroupAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.groupService.setGroupAdmins(data.token, userId, data.userIds)
      await captureMutation(userId, 'group_admins_set', { admins: data.userIds.length })
      return result
    }),
  )
