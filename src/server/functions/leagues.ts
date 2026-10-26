import { productActions } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { BATTLES_PAGE } from '../service'
import { mutationRpc, rpc } from '../rpc'
import { shareLeagueRosterSchema } from '../../contracts/leagueRosterSharing'
import {
  addLeagueEntrantsSchema,
  admitLeagueEntriesSchema,
  assignLeagueRosterRequirementSchema,
  assignLeagueTeamSchema,
  chooseLeagueSideSchema,
  createLeagueBattleSchema,
  createClubGameSchema,
  createLeagueSchema,
  leagueBattlesSchema,
  leagueEventSchema,
  leagueResultsSchema,
  leagueRosterSchema,
  moderateLeagueEntrySchema,
  openLeagueSchema,
  pairLeagueRoundSchema,
  setLeagueAdminsSchema,
  setLeagueTeamDispositionSchema,
  setLeagueTeamWarlordSchema,
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
      const userId = await requireUserId()
      return app().service.leagueService.outdatedLeagueEntriesForRoster(userId, data.rosterId)
    }),
  )

export const openLeague = createServerFn({ method: 'GET' })
  .validator(openLeagueSchema)
  .handler(({ data }) =>
    rpc(async () =>
      app().service.leagueService.league(data.token, await currentUserId(), data.eventToken, await app().battleFactionsFor()),
    ),
  )

/** Where an old or indirect event link lands now, for the route that received it to redirect to. */
export const eventAddress = createServerFn({ method: 'GET' })
  .validator(leagueEventSchema)
  .handler(({ data }) => rpc(() => app().service.leagueService.eventAddress(data.token, data.eventToken)))

export const listLeagueBattles = createServerFn({ method: 'GET' })
  .validator(leagueBattlesSchema)
  .handler(({ data }) =>
    rpc(async () => {
      return app().service.leagueBattles(
        data.token,
        data.eventToken,
        { limit: BATTLES_PAGE, before: data.before ?? undefined },
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
      const userId = await requireUserId()
      return productActions.createLeague(userId, data)
    }),
  )

export const createClubGame = createServerFn({ method: 'POST' })
  .validator(createClubGameSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.createClubGame(userId, data)
      await app().telemetry.capture(userId, 'club_game_created', {
        format: data.format,
        roster_limit: data.rosterLimit,
      })
      return result
    }),
  )

export const joinLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.joinLeague(userId, data)
    }),
  )

export const addLeagueEntrants = createServerFn({ method: 'POST' })
  .validator(addLeagueEntrantsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.addLeagueEntrants(userId, data)
    }),
  )

export const admitLeagueEntries = createServerFn({ method: 'POST' })
  .validator(admitLeagueEntriesSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.admitLeagueEntries(userId, data)
    }),
  )

export const moderateLeagueEntry = createServerFn({ method: 'POST' })
  .validator(moderateLeagueEntrySchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.moderateLeagueEntry(userId, data)
    }),
  )

export const submitLeagueRoster = createServerFn({ method: 'POST' })
  .validator(submitLeagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.submitLeagueRoster(userId, data)
    }),
  )

export const setLeagueTeamDisposition = createServerFn({ method: 'POST' })
  .validator(setLeagueTeamDispositionSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setLeagueTeamDisposition(userId, data)
    }),
  )

export const setLeagueTeamWarlord = createServerFn({ method: 'POST' })
  .validator(setLeagueTeamWarlordSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.setLeagueTeamWarlord(userId, data)
    }),
  )

export const revealLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.revealLeague(userId, data)
    }),
  )

export const remindLeagueEntrants = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return app().service.leagueService.remindLeagueEntrants(data.token, userId, data.eventToken)
    }),
  )

export const openLeagueRoster = createServerFn({ method: 'GET' })
  .validator(leagueRosterSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.leagueService.leagueRoster(data.token, data.userId, data.eventToken, await currentUserId())),
  )

export const listFriendLeagueRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const userId = await requireUserId()
    return app().service.leagueService.friendLeagueRosters(userId)
  }),
)

export const leagueRosterSharing = createServerFn({ method: 'GET' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await requireUserId()
      return app().service.leagueService.rosterSharing(data.token, data.eventToken, userId)
    }),
  )

export const shareLeagueRoster = createServerFn({ method: 'POST' })
  .validator(shareLeagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.shareRoster(data.token, data.eventToken, userId, data.submittedAt, data.rosterId)
      await app().telemetry.capture(userId, 'league_roster_published')
      return result
    }),
  )

export const dismissLeagueRosterSharing = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return app().service.leagueService.dismissRosterSharing(data.token, data.eventToken, userId)
    }),
  )

export const unsealLeagueRoster = createServerFn({ method: 'POST' })
  .validator(leagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.unsealLeagueRoster(userId, data)
    }),
  )

export const assignLeagueRosterRequirement = createServerFn({ method: 'POST' })
  .validator(assignLeagueRosterRequirementSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.assignLeagueRosterRequirement(userId, data)
    }),
  )

export const assignLeagueTeam = createServerFn({ method: 'POST' })
  .validator(assignLeagueTeamSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.assignLeagueTeam(userId, data)
    }),
  )

export const chooseLeagueSide = createServerFn({ method: 'POST' })
  .validator(chooseLeagueSideSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.chooseLeagueSide(userId, data)
    }),
  )

export const updateLeague = createServerFn({ method: 'POST' })
  .validator(updateLeagueSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.updateLeague(userId, data)
    }),
  )

export const setLeagueAdmins = createServerFn({ method: 'POST' })
  .validator(setLeagueAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.setLeagueAdmins(data.token, userId, data.userIds)
      await app().telemetry.capture(userId, 'league_admins_updated', { count: data.userIds.length, added: result.added.length })
      return null
    }),
  )

export const deleteLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.deleteLeague(userId, data)
    }),
  )

export const createLeagueBattle = createServerFn({ method: 'POST' })
  .validator(createLeagueBattleSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      return productActions.createLeagueBattle(userId, data)
    }),
  )

export const pairLeagueRound = createServerFn({ method: 'POST' })
  .validator(pairLeagueRoundSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.pairLeagueRound(data.token, data.eventToken, userId)
      await app().telemetry.capture(userId, 'league_round_paired', { round: result.round })
      return result
    }),
  )
