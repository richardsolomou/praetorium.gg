import { productActions, signedInAction } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { BATTLES_PAGE } from '../service'
import { mutationRpc, rpc } from '../rpc'
import { captureMutation } from '../mutationTelemetry'
import { captureBattleCommand } from '../battleTelemetry'
import { shareSealedEventRosterSchema } from '../../contracts/sealedEventRosterSharing'
import {
  addSealedEventEntrantsSchema,
  admitSealedEventEntriesSchema,
  assignSealedEventRosterRequirementSchema,
  assignSealedEventTeamSchema,
  chooseSealedEventSideSchema,
  createSealedEventBattleSchema,
  createHiddenListGameSchema,
  createSealedEventSchema,
  sealedEventBattlesSchema,
  sealedEventSchema,
  sealedEventResultsSchema,
  sealedEventRosterSchema,
  moderateSealedEventEntrySchema,
  openSealedEventSchema,
  pairSealedEventRoundSchema,
  reopenSwissTableSchema,
  setSealedEventAdminsSchema,
  setSealedEventTeamDispositionSchema,
  setSealedEventTeamWarlordSchema,
  submitSealedEventRosterSchema,
  tokenSchema,
  updateSealedEventSchema,
} from '../../contracts/schemas'

export const listSealedEvents = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => app().service.sealedEventService.sealedEvents(await currentUserId())),
)

export const outdatedSealedEventEntriesForRoster = createServerFn({ method: 'GET' })
  .validator(z.object({ rosterId: z.string().min(1).max(128) }))
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await requireUserId()
      return app().service.sealedEventService.outdatedSealedEventEntriesForRoster(userId, data.rosterId)
    }),
  )

export const openSealedEvent = createServerFn({ method: 'GET' })
  .validator(openSealedEventSchema)
  .handler(({ data }) =>
    rpc(async () =>
      app().service.sealedEventService.sealedEvent(data.token, await currentUserId(), data.eventToken, await app().battleFactionsFor()),
    ),
  )

/** Where an old or indirect event link lands now, for the route that received it to redirect to. */
export const eventAddress = createServerFn({ method: 'GET' })
  .validator(sealedEventSchema)
  .handler(({ data }) => rpc(() => app().service.sealedEventService.eventAddress(data.token, data.eventToken)))

export const listSealedEventBattles = createServerFn({ method: 'GET' })
  .validator(sealedEventBattlesSchema)
  .handler(({ data }) =>
    rpc(async () => {
      return app().service.sealedEventBattles(
        data.token,
        data.eventToken,
        { limit: BATTLES_PAGE, before: data.before ?? undefined },
        await app().rulesFor(),
        await app().battleFactionsFor(),
        await currentUserId(),
      )
    }),
  )

export const sealedEventResults = createServerFn({ method: 'GET' })
  .validator(sealedEventResultsSchema)
  .handler(({ data }) =>
    rpc(async () =>
      app().service.sealedEventResults(
        data.token,
        data.eventToken,
        await app().rulesFor(),
        await app().battleFactionsFor(),
        await currentUserId(),
      ),
    ),
  )

export const createSealedEvent = createServerFn({ method: 'POST' })
  .validator(createSealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.createLeague, data))

export const createHiddenListGame = createServerFn({ method: 'POST' })
  .validator(createHiddenListGameSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.createHiddenListGame(userId, data)
      await captureMutation(userId, 'hidden_list_game_created', {
        format: data.format,
        roster_limit: data.rosterLimit,
      })
      return result
    }),
  )

export const joinSealedEvent = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.joinLeague, data))

export const addSealedEventEntrants = createServerFn({ method: 'POST' })
  .validator(addSealedEventEntrantsSchema)
  .handler(({ data }) => signedInAction(productActions.addLeagueEntrants, data))

export const admitSealedEventEntries = createServerFn({ method: 'POST' })
  .validator(admitSealedEventEntriesSchema)
  .handler(({ data }) => signedInAction(productActions.admitLeagueEntries, data))

export const moderateSealedEventEntry = createServerFn({ method: 'POST' })
  .validator(moderateSealedEventEntrySchema)
  .handler(({ data }) => signedInAction(productActions.moderateLeagueEntry, data))

export const submitSealedEventRoster = createServerFn({ method: 'POST' })
  .validator(submitSealedEventRosterSchema)
  .handler(({ data }) => signedInAction(productActions.submitLeagueRoster, data))

export const setSealedEventTeamDisposition = createServerFn({ method: 'POST' })
  .validator(setSealedEventTeamDispositionSchema)
  .handler(({ data }) => signedInAction(productActions.setLeagueTeamDisposition, data))

export const setSealedEventTeamWarlord = createServerFn({ method: 'POST' })
  .validator(setSealedEventTeamWarlordSchema)
  .handler(({ data }) => signedInAction(productActions.setLeagueTeamWarlord, data))

export const revealSealedEvent = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.revealLeague, data))

export const remindSealedEventEntrants = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.remindSealedEventEntrants(data.token, userId, data.eventToken)
      await captureMutation(userId, 'sealed_event_entrants_reminded', { recipients: result.reminded })
      return result
    }),
  )

export const openSealedEventRoster = createServerFn({ method: 'GET' })
  .validator(sealedEventRosterSchema)
  .handler(({ data }) =>
    rpc(async () => app().service.sealedEventService.sealedEventRoster(data.token, data.userId, data.eventToken, await currentUserId())),
  )

export const openRevealedSealedEventRosters = createServerFn({ method: 'GET' })
  .validator(sealedEventSchema)
  .handler(({ data }) => rpc(() => app().service.sealedEventService.revealedSealedEventRosters(data.token, data.eventToken)))

export const listFriendSealedEventRosters = createServerFn({ method: 'GET' }).handler(() =>
  rpc(async () => {
    const userId = await requireUserId()
    return app().service.sealedEventService.friendSealedEventRosters(userId)
  }),
)

export const sealedEventRosterSharing = createServerFn({ method: 'GET' })
  .validator(sealedEventSchema)
  .handler(({ data }) =>
    rpc(async () => {
      const userId = await requireUserId()
      return app().service.sealedEventService.rosterSharing(data.token, data.eventToken, userId)
    }),
  )

export const shareSealedEventRoster = createServerFn({ method: 'POST' })
  .validator(shareSealedEventRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.shareRoster(
        data.token,
        data.eventToken,
        userId,
        data.submittedAt,
        data.rosterId,
      )
      await captureMutation(userId, 'sealed_event_roster_published')
      return result
    }),
  )

export const dismissSealedEventRosterSharing = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.dismissRosterSharing(data.token, data.eventToken, userId)
      await captureMutation(userId, 'sealed_event_roster_sharing_dismissed')
      return result
    }),
  )

export const unsealSealedEventRoster = createServerFn({ method: 'POST' })
  .validator(sealedEventRosterSchema)
  .handler(({ data }) => signedInAction(productActions.unsealLeagueRoster, data))

export const assignSealedEventRosterRequirement = createServerFn({ method: 'POST' })
  .validator(assignSealedEventRosterRequirementSchema)
  .handler(({ data }) => signedInAction(productActions.assignLeagueRosterRequirement, data))

export const assignSealedEventTeam = createServerFn({ method: 'POST' })
  .validator(assignSealedEventTeamSchema)
  .handler(({ data }) => signedInAction(productActions.assignLeagueTeam, data))

export const chooseSealedEventSide = createServerFn({ method: 'POST' })
  .validator(chooseSealedEventSideSchema)
  .handler(({ data }) => signedInAction(productActions.chooseLeagueSide, data))

export const updateSealedEvent = createServerFn({ method: 'POST' })
  .validator(updateSealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.updateLeague, data))

export const setSealedEventAdmins = createServerFn({ method: 'POST' })
  .validator(setSealedEventAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.setSealedEventAdmins(data.token, userId, data.userIds)
      await captureMutation(userId, 'tournament_admins_updated', { count: data.userIds.length, added: result.added.length })
      return null
    }),
  )

export const deleteSealedEvent = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) => signedInAction(productActions.deleteLeague, data))

export const createSealedEventBattle = createServerFn({ method: 'POST' })
  .validator(createSealedEventBattleSchema)
  .handler(({ data }) => signedInAction(productActions.createLeagueBattle, data))

export const dropSealedEventEntrant = createServerFn({ method: 'POST' })
  .validator(sealedEventRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.dropSealedEventEntrant(data.token, data.eventToken ?? '', userId, data.userId)
      await captureMutation(userId, 'sealed_event_entrant_dropped', { withdrew: data.userId === userId })
    }),
  )

export const pairSealedEventRound = createServerFn({ method: 'POST' })
  .validator(pairSealedEventRoundSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.pairSealedEventRound(data.token, data.eventToken, userId)
      await captureMutation(userId, 'sealed_event_round_paired', { round: result.round })
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
