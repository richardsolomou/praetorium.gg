import { productActions, signedInAction } from '../productActions'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { app } from '../app'
import { currentUserId, requireUserId } from '../playerSession'
import { BATTLES_PAGE } from '../services/battleFeedService'
import { mutationRpc, rpc } from '../rpc'
import { captureMutation, checkInSealedEventEntrant } from '../mutationTelemetry'
import { reopenTournamentTable, tournamentBattlefieldRules } from '../tournamentTableActions'
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
  setRoundTimerSchema,
  setTiebreakSchema,
  checkInSchema,
  dropNoShowsSchema,
  swapTableSeatsSchema,
  setSquadSchema,
  pickSquadSchema,
  reportTableResultSchema,
  setTableBattlefieldSchema,
  tableBattlefieldsSchema,
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
  .handler(({ data }) => rpc(async () => app().service.sealedEventService.eventAddress(data.token, await currentUserId(), data.eventToken)))

export const listSealedEventBattles = createServerFn({ method: 'GET' })
  .validator(sealedEventBattlesSchema)
  .handler(({ data }) =>
    rpc(async () => {
      return app().service.sealedEventResultsService.sealedEventBattles(
        data.token,
        data.eventToken,
        { limit: BATTLES_PAGE, before: data.before, filter: data.filter, order: data.order },
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
      app().service.sealedEventResultsService.sealedEventResults(
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
  .handler(({ data }) => signedInAction(productActions.createSealedEvent, data))

export const createHiddenListGame = createServerFn({ method: 'POST' })
  .validator(createHiddenListGameSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.createHiddenListGame(userId, data)
      captureMutation(userId, 'hidden_list_game_created', {
        format: data.format,
        roster_limit: data.rosterLimit,
      })
      return result
    }),
  )

export const joinSealedEvent = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.joinSealedEvent, data))

export const addSealedEventEntrants = createServerFn({ method: 'POST' })
  .validator(addSealedEventEntrantsSchema)
  .handler(({ data }) => signedInAction(productActions.addSealedEventEntrants, data))

export const admitSealedEventEntries = createServerFn({ method: 'POST' })
  .validator(admitSealedEventEntriesSchema)
  .handler(({ data }) => signedInAction(productActions.admitSealedEventEntries, data))

export const moderateSealedEventEntry = createServerFn({ method: 'POST' })
  .validator(moderateSealedEventEntrySchema)
  .handler(({ data }) => signedInAction(productActions.moderateSealedEventEntry, data))

export const submitSealedEventRoster = createServerFn({ method: 'POST' })
  .validator(submitSealedEventRosterSchema)
  .handler(({ data }) => signedInAction(productActions.submitSealedEventRoster, data))

export const setSealedEventTeamDisposition = createServerFn({ method: 'POST' })
  .validator(setSealedEventTeamDispositionSchema)
  .handler(({ data }) => signedInAction(productActions.setSealedEventTeamDisposition, data))

export const setSealedEventTeamWarlord = createServerFn({ method: 'POST' })
  .validator(setSealedEventTeamWarlordSchema)
  .handler(({ data }) => signedInAction(productActions.setSealedEventTeamWarlord, data))

export const revealSealedEvent = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.revealSealedEvent, data))

export const remindSealedEventEntrants = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.remindSealedEventEntrants(data.token, userId, data.eventToken)
      captureMutation(userId, 'sealed_event_entrants_reminded', { recipients: result.reminded })
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
      captureMutation(userId, 'sealed_event_roster_published')
      return result
    }),
  )

export const dismissSealedEventRosterSharing = createServerFn({ method: 'POST' })
  .validator(sealedEventSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.dismissRosterSharing(data.token, data.eventToken, userId)
      captureMutation(userId, 'sealed_event_roster_sharing_dismissed')
      return result
    }),
  )

export const unsealSealedEventRoster = createServerFn({ method: 'POST' })
  .validator(sealedEventRosterSchema)
  .handler(({ data }) => signedInAction(productActions.unsealSealedEventRoster, data))

export const assignSealedEventRosterRequirement = createServerFn({ method: 'POST' })
  .validator(assignSealedEventRosterRequirementSchema)
  .handler(({ data }) => signedInAction(productActions.assignSealedEventRosterRequirement, data))

export const assignSealedEventTeam = createServerFn({ method: 'POST' })
  .validator(assignSealedEventTeamSchema)
  .handler(({ data }) => signedInAction(productActions.assignSealedEventTeam, data))

export const chooseSealedEventSide = createServerFn({ method: 'POST' })
  .validator(chooseSealedEventSideSchema)
  .handler(({ data }) => signedInAction(productActions.chooseSealedEventSide, data))

export const updateSealedEvent = createServerFn({ method: 'POST' })
  .validator(updateSealedEventSchema)
  .handler(({ data }) => signedInAction(productActions.updateSealedEvent, data))

export const setSealedEventAdmins = createServerFn({ method: 'POST' })
  .validator(setSealedEventAdminsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventService.setSealedEventAdmins(data.token, userId, data.userIds)
      captureMutation(userId, 'tournament_admins_updated', { count: data.userIds.length, added: result.added.length })
      return null
    }),
  )

export const deleteSealedEvent = createServerFn({ method: 'POST' })
  .validator(tokenSchema)
  .handler(({ data }) => signedInAction(productActions.deleteSealedEvent, data))

export const createSealedEventBattle = createServerFn({ method: 'POST' })
  .validator(createSealedEventBattleSchema)
  .handler(({ data }) => signedInAction(productActions.createSealedEventBattle, data))

export const dropSealedEventEntrant = createServerFn({ method: 'POST' })
  .validator(sealedEventRosterSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.dropSealedEventEntrant(data.token, data.eventToken ?? '', userId, data.userId)
      captureMutation(userId, 'sealed_event_entrant_dropped', { withdrew: data.userId === userId })
    }),
  )

export const pairSealedEventRound = createServerFn({ method: 'POST' })
  .validator(pairSealedEventRoundSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const result = await app().service.sealedEventResultsService.pairSealedEventRound(data.token, data.eventToken, userId)
      captureMutation(userId, 'sealed_event_round_paired', { round: result.round })
      return result
    }),
  )

export const checkInEntrant = createServerFn({ method: 'POST' })
  .validator(checkInSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await checkInSealedEventEntrant(userId, data.token, data.eventToken ?? data.token, data.userId, data.checkedIn)
    }),
  )

export const dropNoShows = createServerFn({ method: 'POST' })
  .validator(dropNoShowsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.dropNoShows(data.token, data.eventToken ?? data.token, userId)
      captureMutation(userId, 'sealed_event_no_shows_dropped', {})
    }),
  )

export const setTiebreak = createServerFn({ method: 'POST' })
  .validator(setTiebreakSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.setTiebreak(data.token, data.eventToken ?? data.token, userId, data.scheduleFirst)
      captureMutation(userId, 'sealed_event_tiebreak_set', { scheduleFirst: data.scheduleFirst })
    }),
  )

export const setRoundTimer = createServerFn({ method: 'POST' })
  .validator(setRoundTimerSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.setRoundTimer(data.token, data.eventToken ?? data.token, userId, data.minutes, data.fromEnd)
      captureMutation(userId, 'sealed_event_round_timer_set', { minutes: data.minutes })
    }),
  )

export const swapTableSeats = createServerFn({ method: 'POST' })
  .validator(swapTableSeatsSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.swapSeats(data.token, data.eventToken ?? data.token, userId, data.players)
      captureMutation(userId, 'sealed_event_seats_swapped', {})
    }),
  )

export const setSquad = createServerFn({ method: 'POST' })
  .validator(setSquadSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.setSquad(data.token, data.eventToken ?? data.token, userId, data.squad)
      captureMutation(userId, 'sealed_event_team_set', { action: data.squad === null ? 'leave' : 'name' in data.squad ? 'create' : 'join' })
    }),
  )

export const pickSquad = createServerFn({ method: 'POST' })
  .validator(pickSquadSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      const { token, eventToken, ...pick } = data
      const result = await app().service.sealedEventService.pickSquad({ token, eventToken: eventToken ?? token, ownerId: userId, ...pick })
      captureMutation(userId, 'sealed_event_team_pick', { step: data.step, revealed: result.revealed })
    }),
  )

export const tableBattlefields = createServerFn({ method: 'GET' })
  .validator(tableBattlefieldsSchema)
  .handler(({ data }) =>
    rpc(async () =>
      app().service.sealedEventService.tableBattlefields(
        data.token,
        data.eventToken,
        data.round,
        data.table,
        data.missionPackId,
        await tournamentBattlefieldRules(),
      ),
    ),
  )

export const setTableBattlefield = createServerFn({ method: 'POST' })
  .validator(setTableBattlefieldSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventService.setTableBattlefield(
        data.token,
        data.eventToken ?? data.token,
        userId,
        data.round,
        data.table,
        data.missionPackId,
        data.battlefield,
        await tournamentBattlefieldRules(),
      )
      captureMutation(userId, 'sealed_event_battlefield_set', {
        rolled: data.battlefield === 'roll',
        cleared: data.battlefield === null,
      })
    }),
  )

export const reportTableResult = createServerFn({ method: 'POST' })
  .validator(reportTableResultSchema)
  .handler(({ data }) =>
    mutationRpc(async () => {
      const userId = await requireUserId()
      await app().service.sealedEventResultsService.reportTableResult(
        data.token,
        data.eventToken,
        data.round,
        data.table,
        data.vp,
        data.missionPackId,
        userId,
      )
      captureMutation(userId, 'sealed_event_result_reported', { round: data.round })
    }),
  )

export const reopenSwissTable = createServerFn({ method: 'POST' })
  .validator(reopenSwissTableSchema)
  .handler(({ data }) => mutationRpc(async () => reopenTournamentTable(await requireUserId(), data)))
