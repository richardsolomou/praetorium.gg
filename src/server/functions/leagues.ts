import { productActions } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { currentUserId, requireUser } from '../playerSession'
import { mutationRpc, rpc } from '../rpc'
import { dismissLeagueRosterSharingSchema, shareLeagueRosterSchema } from '../../contracts/leagueRosterSharing'
import {
  addLeagueEntrantsSchema,
  admitLeagueEntriesSchema,
  assignLeagueRosterRequirementSchema,
  assignLeagueTeamSchema,
  createLeagueBattleSchema,
  createLeagueEventSchema,
  createLeagueSchema,
  leagueBattlesSchema,
  leagueEventSchema,
  leagueResultsSchema,
  leagueRosterSchema,
  moderateLeagueEntrySchema,
  openLeagueSchema,
  setLeagueAdminsSchema,
  setLeagueTeamDispositionSchema,
  submitLeagueRosterSchema,
  tokenSchema,
  updateLeagueSchema,
} from '../../contracts/schemas'

export const listLeagues = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.leagueService.leagues(await currentUserId())),
)

export const outdatedLeagueEntriesForRoster = createServerFn({ method: 'GET' })
  .validator(z.object({ rosterId: z.string().min(1).max(128) }))
  .handler(({ data }) =>
    rpc(async () => {
      const player = await requireUser()
      return app().service.leagueService.outdatedLeagueEntriesForRoster(player.id, data.rosterId)
    }),
  )

export const openLeague = createServerFn({ method: 'GET' })
  .validator(openLeagueSchema)
  .handler(({ data }) =>
    rpc(async () =>
      app().service.leagueService.league(data.token, await currentUserId(), data.eventToken, await app().battleFactionsFor()),
    ),
  )

export const listLeagueBattles = createServerFn({ method: 'GET' })
  .validator(leagueBattlesSchema)
  .handler(({ data }) =>
    rpc(async () => {
      return app().service.leagueBattles(
        data.token,
        data.eventToken,
        { limit: 25, before: data.before ?? undefined },
        await app().battleMissionRulesFor(),
        await app().battleFactionsFor(),
        await currentUserId(),
      )
    }),
  )

export const leagueResults = createServerFn({ method: 'GET' })
  .validator(leagueResultsSchema)
  .handler(({ data }) =>
    rpc(async () =>
      app().service.leagueResults(
        data.token,
        data.eventToken,
        await app().battleMissionRulesFor(),
        await app().battleFactionsFor(),
        await currentUserId(),
      ),
    ),
  )

export const createLeague = createServerFn({ method: 'POST' })
  .validator(createLeagueSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.createLeague(player.id, data)
    }),
  )

export const joinLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.joinLeague(player.id, data)
    }),
  )

export const addLeagueEntrants = createServerFn({ method: 'POST' })
  .validator(addLeagueEntrantsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.addLeagueEntrants(player.id, data)
    }),
  )

export const admitLeagueEntries = createServerFn({ method: 'POST' })
  .validator(admitLeagueEntriesSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.admitLeagueEntries(player.id, data)
    }),
  )

export const moderateLeagueEntry = createServerFn({ method: 'POST' })
  .validator(moderateLeagueEntrySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.moderateLeagueEntry(player.id, data)
    }),
  )

export const submitLeagueRoster = createServerFn({ method: 'POST' })
  .validator(submitLeagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.submitLeagueRoster(player.id, data)
    }),
  )

export const setLeagueTeamDisposition = createServerFn({ method: 'POST' })
  .validator(setLeagueTeamDispositionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.setLeagueTeamDisposition(player.id, data)
    }),
  )

export const revealLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.revealLeague(player.id, data)
    }),
  )

export const openLeagueRoster = createServerFn({ method: 'GET' })
  .validator(leagueRosterSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.leagueService.leagueRoster(data.token, data.userId, data.eventToken, await currentUserId())),
  )

export const listFriendLeagueRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const player = await requireUser()
    return app().service.leagueService.friendLeagueRosters(player.id)
  }),
)

export const leagueRosterSharing = createServerFn({ method: 'GET' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const player = await requireUser()
      return app().service.leagueService.rosterSharing(data.token, data.eventToken ?? '', player.id)
    }),
  )

export const shareLeagueRoster = createServerFn({ method: 'POST' })
  .validator(shareLeagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.leagueService.shareRoster(
        data.token,
        data.eventToken ?? '',
        player.id,
        data.submittedAt,
        data.rosterId,
      )
      await app().telemetry.capture(player.id, 'league_roster_published')
      return result
    }),
  )

export const dismissLeagueRosterSharing = createServerFn({ method: 'POST' })
  .validator(dismissLeagueRosterSharingSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return app().service.leagueService.dismissRosterSharing(data.token, data.eventToken ?? '', player.id)
    }),
  )

export const unsealLeagueRoster = createServerFn({ method: 'POST' })
  .validator(leagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.unsealLeagueRoster(player.id, data)
    }),
  )

export const createLeagueEvent = createServerFn({ method: 'POST' })
  .validator(createLeagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.createLeagueEvent(player.id, data)
    }),
  )

export const assignLeagueRosterRequirement = createServerFn({ method: 'POST' })
  .validator(assignLeagueRosterRequirementSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.assignLeagueRosterRequirement(player.id, data)
    }),
  )

export const assignLeagueTeam = createServerFn({ method: 'POST' })
  .validator(assignLeagueTeamSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.assignLeagueTeam(player.id, data)
    }),
  )

export const updateLeague = createServerFn({ method: 'POST' })
  .validator(updateLeagueSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.updateLeague(player.id, data)
    }),
  )

export const setLeagueAdmins = createServerFn({ method: 'POST' })
  .validator(setLeagueAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      const result = await app().service.leagueService.setLeagueAdmins(data.token, player.id, data.userIds)
      await app().telemetry.capture(player.id, 'league_admins_updated', { count: data.userIds.length, added: result.added.length })
      return null
    }),
  )

export const deleteLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.deleteLeague(player.id, data)
    }),
  )

export const createLeagueBattle = createServerFn({ method: 'POST' })
  .validator(createLeagueBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const player = await requireUser()
      return productActions.createLeagueBattle(player.id, data)
    }),
  )
