import { productActions, signedInAction } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { BATTLES_PAGE } from '../service'
import { mutationRpc, rpc } from '../rpc'
import { captureMutation } from '../mutationTelemetry'
import { captureBattleCommand } from '../battleTelemetry'
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
  reopenSwissTableSchema,
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
        await app().rulesFor(),
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
        await app().rulesFor(),
        await app().battleFactionsFor(),
        await currentUserId(),
      ),
    ),
  )

export const createLeague = createServerFn({ method: 'POST' })
  .validator(createLeagueSchema)
  .handler(({ data }) => signedInAction(productActions.createLeague, data))

export const createClubGame = createServerFn({ method: 'POST' })
  .validator(createClubGameSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.createClubGame(userId, data)
      await captureMutation(userId, 'club_game_created', {
        format: data.format,
        roster_limit: data.rosterLimit,
      })
      return result
    }),
  )

export const joinLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) => signedInAction(productActions.joinLeague, data))

export const addLeagueEntrants = createServerFn({ method: 'POST' })
  .validator(addLeagueEntrantsSchema)
  .handler(({ data }) => signedInAction(productActions.addLeagueEntrants, data))

export const admitLeagueEntries = createServerFn({ method: 'POST' })
  .validator(admitLeagueEntriesSchema)
  .handler(({ data }) => signedInAction(productActions.admitLeagueEntries, data))

export const moderateLeagueEntry = createServerFn({ method: 'POST' })
  .validator(moderateLeagueEntrySchema)
  .handler(({ data }) => signedInAction(productActions.moderateLeagueEntry, data))

export const submitLeagueRoster = createServerFn({ method: 'POST' })
  .validator(submitLeagueRosterSchema)
  .handler(({ data }) => signedInAction(productActions.submitLeagueRoster, data))

export const setLeagueTeamDisposition = createServerFn({ method: 'POST' })
  .validator(setLeagueTeamDispositionSchema)
  .handler(({ data }) => signedInAction(productActions.setLeagueTeamDisposition, data))

export const setLeagueTeamWarlord = createServerFn({ method: 'POST' })
  .validator(setLeagueTeamWarlordSchema)
  .handler(({ data }) => signedInAction(productActions.setLeagueTeamWarlord, data))

export const revealLeague = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) => signedInAction(productActions.revealLeague, data))

export const remindLeagueEntrants = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.remindLeagueEntrants(data.token, userId, data.eventToken)
      await captureMutation(userId, 'league_entrants_reminded', { recipients: result.reminded })
      return result
    }),
  )

export const openLeagueRoster = createServerFn({ method: 'GET' })
  .validator(leagueRosterSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.leagueService.leagueRoster(data.token, data.userId, data.eventToken, await currentUserId())),
  )

export const openRevealedLeagueRosters = createServerFn({ method: 'GET' })
  .validator(leagueEventSchema)
  .handler(({ data }) => rpc(() => app().service.leagueService.revealedLeagueRosters(data.token, data.eventToken)))

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
      await captureMutation(userId, 'league_roster_published')
      return result
    }),
  )

export const dismissLeagueRosterSharing = createServerFn({ method: 'POST' })
  .validator(leagueEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.dismissRosterSharing(data.token, data.eventToken, userId)
      await captureMutation(userId, 'league_roster_sharing_dismissed')
      return result
    }),
  )

export const unsealLeagueRoster = createServerFn({ method: 'POST' })
  .validator(leagueRosterSchema)
  .handler(({ data }) => signedInAction(productActions.unsealLeagueRoster, data))

export const assignLeagueRosterRequirement = createServerFn({ method: 'POST' })
  .validator(assignLeagueRosterRequirementSchema)
  .handler(({ data }) => signedInAction(productActions.assignLeagueRosterRequirement, data))

export const assignLeagueTeam = createServerFn({ method: 'POST' })
  .validator(assignLeagueTeamSchema)
  .handler(({ data }) => signedInAction(productActions.assignLeagueTeam, data))

export const chooseLeagueSide = createServerFn({ method: 'POST' })
  .validator(chooseLeagueSideSchema)
  .handler(({ data }) => signedInAction(productActions.chooseLeagueSide, data))

export const updateLeague = createServerFn({ method: 'POST' })
  .validator(updateLeagueSchema)
  .handler(({ data }) => signedInAction(productActions.updateLeague, data))

export const setLeagueAdmins = createServerFn({ method: 'POST' })
  .validator(setLeagueAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.leagueService.setLeagueAdmins(data.token, userId, data.userIds)
      await captureMutation(userId, 'league_admins_updated', { count: data.userIds.length, added: result.added.length })
      return null
    }),
  )

export const deleteLeague = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) => signedInAction(productActions.deleteLeague, data))

export const createLeagueBattle = createServerFn({ method: 'POST' })
  .validator(createLeagueBattleSchema)
  .handler(({ data }) => signedInAction(productActions.createLeagueBattle, data))

export const dropLeagueEntrant = createServerFn({ method: 'POST' })
  .validator(leagueRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.leagueService.dropLeagueEntrant(data.token, data.eventToken ?? '', userId, data.userId)
      await captureMutation(userId, 'league_entrant_dropped', { withdrew: data.userId === userId })
    }),
  )

export const pairLeagueRound = createServerFn({ method: 'POST' })
  .validator(pairLeagueRoundSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.pairLeagueRound(data.token, data.eventToken, userId)
      await captureMutation(userId, 'league_round_paired', { round: result.round })
      return result
    }),
  )

export const reopenSwissTable = createServerFn({ method: 'POST' })
  .validator(reopenSwissTableSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const startedAt = performance.now()
      const { battleId, result } = await app().service.reopenSwissTable(data.token, data.eventToken, data.battleToken, userId)
      await captureBattleCommand(userId, battleId, { kind: 'reopen-battle' }, { result }, performance.now() - startedAt, 'direct')
      if (result.outcome === 'refused') throw new Response(result.reason, { status: 409 })
      if (result.outcome === 'stale') throw new Response('the battle changed while it was being reopened, so try again', { status: 409 })
    }),
  )
