import type { z } from 'zod'
import { saveRosterSchema } from '../contracts/schemas'
import { offlineActionSchemas as schemas, type OfflineActionKind } from '../contracts/offlineActions'
import { app } from './app'
import { rosterForUse, withCurrentAlerts } from './rosterUsage'
import { captureMutation, captureBattleCreated, captureSealedEventCreated, captureSealedEventBattleCreated } from './mutationTelemetry'
import { requireUserId } from './playerSession'
import { mutationRpc } from './rpc'

const ONBOARDING_TASK_EVENTS = {
  complete: 'onboarding_task_completed',
  skip: 'onboarding_task_skipped',
  restore: 'onboarding_task_restored',
} as const

function action<S extends z.ZodType, R>(schema: S, work: (owner: string, data: z.output<S>) => Promise<R>) {
  return (owner: string, input: unknown) => work(owner, schema.parse(input))
}

/** Runs a product action from a server function as the signed-in player. */
export function signedInAction<R>(run: (owner: string, input: unknown) => Promise<R>, input: unknown) {
  return mutationRpc(async () => run(await requireUserId(), input))
}

/** A roster as a seal compares it: alerts belong to the player, so a device's older copy of them never conflicts. */
const sealedContent = (roster: z.infer<typeof saveRosterSchema>) =>
  JSON.stringify({ ...roster, prep: roster.prep && { ...roster.prep, reminders: undefined } })

export const productActions = {
  setOwned: action(schemas.setOwned, async (owner, data) => {
    const result = await app().service.rosterService.setOwned(owner, data.entryId, data.owned)
    await captureMutation(owner, 'player_collection_updated', { owned: data.owned })
    return result
  }),
  setCollectionModels: action(schemas.setCollectionModels, async (owner, data) => {
    await app().service.rosterService.setCollectionModels(owner, data.entryId, data.models)
    await captureMutation(owner, 'player_collection_counted', { models: data.models })
  }),
  setCollectionProgress: action(schemas.setCollectionProgress, async (owner, data) => {
    await app().service.rosterService.setCollectionProgress(owner, data.entryId, { built: data.built, painted: data.painted })
    await captureMutation(owner, 'player_collection_progressed', { built: data.built, painted: data.painted })
  }),
  setCollectionCountsAs: action(schemas.setCollectionCountsAs, async (owner, data) => {
    await app().service.rosterService.setCollectionCountsAs(owner, data.entryId, data.countsAs)
    await captureMutation(owner, 'player_collection_linked', { datasheets: data.countsAs.length })
  }),
  setCollectionWanted: action(schemas.setCollectionWanted, async (owner, data) => {
    await app().service.rosterService.setCollectionWanted(owner, data.entryId, data.wanted)
    await captureMutation(owner, 'player_collection_wished', { wanted: data.wanted })
  }),
  setFavouriteFaction: action(schemas.setFavouriteFaction, async (owner, data) => {
    await app().service.rosterService.setFavouriteFaction(owner, data.catalogueId, data.favourite)
    await captureMutation(owner, 'favourite_faction_updated', { favourite: data.favourite })
    return null
  }),
  setFavouriteDetachment: action(schemas.setFavouriteDetachment, async (owner, data) => {
    await app().service.rosterService.setFavouriteDetachment(owner, data.catalogueId, data.detachmentId, data.favourite)
    await captureMutation(owner, 'favourite_detachment_updated', { favourite: data.favourite })
    return null
  }),
  setFavouriteDatasheet: action(schemas.setFavouriteDatasheet, async (owner, data) => {
    await app().service.rosterService.setFavouriteDatasheet(owner, data.entryId, data.favourite)
    await captureMutation(owner, 'favourite_datasheet_updated', { favourite: data.favourite })
    return null
  }),
  rememberMatchup: action(schemas.rememberMatchup, async (owner, data) => {
    await app().service.rememberMatchup(owner, data)
    return null
  }),
  forgetMatchup: action(schemas.forgetMatchup, async (owner, data) => {
    await app().service.forgetMatchup(owner, data.shared)
    return null
  }),
  setAbilityReminder: action(schemas.setAbilityReminder, async (owner, data) => {
    await app().service.setAbilityReminder(owner, data)
    await captureMutation(owner, 'ability_reminder_set', { timings: data.timings.length })
    return null
  }),
  removeAbilityReminder: action(schemas.removeAbilityReminder, async (owner, data) => {
    await app().repository.deleteAbilityReminder(owner, data.key)
    await captureMutation(owner, 'ability_reminder_removed')
    return null
  }),
  setPlayerDefaults: action(schemas.setPlayerDefaults, async (owner, data) => {
    const defaults = await app().service.setPlayerDefaults(owner, data)
    await captureMutation(owner, 'player_defaults_set', {
      roster_visibility: defaults.rosterVisibility,
      battle_size: defaults.battleSize,
    })
    return defaults
  }),
  setPushNotifications: action(schemas.setPushNotifications, async (owner, data) => {
    const instance = app()
    const enabled = await instance.service.setPushEnabled(owner, data.enabled)
    await captureMutation(owner, 'push_notifications_updated', { enabled })
    return enabled
  }),
  updateOnboardingProgress: action(schemas.updateOnboardingProgress, async (owner, data) => {
    const progress = await app().repository.updateOnboardingProgress(owner, data)
    if (data.operation === 'welcome') await captureMutation(owner, 'onboarding_welcomed')
    else await captureMutation(owner, ONBOARDING_TASK_EVENTS[data.operation], { task: data.task })
    return progress
  }),
  requestFriend: action(schemas.requestFriend, async (owner, data) => {
    const result = await app().service.socialService.requestFriend(owner, data.userId)
    await captureMutation(owner, 'friend_request_sent')
    return result
  }),
  acceptFriend: action(schemas.acceptFriend, async (owner, data) => {
    const result = await app().service.socialService.acceptFriend(owner, data.userId)
    await captureMutation(owner, 'friend_request_accepted')
    return result
  }),
  rejectFriend: action(schemas.rejectFriend, async (owner, data) => {
    const result = await app().service.socialService.rejectFriend(owner, data.userId)
    await captureMutation(owner, 'friend_request_rejected')
    return result
  }),
  removeFriend: action(schemas.removeFriend, async (owner, data) => {
    const result = await app().service.socialService.removeFriend(owner, data.userId)
    await captureMutation(owner, 'friendship_removed')
    return result
  }),
  acceptFriendInvite: action(schemas.acceptFriendInvite, async (owner, data) => {
    await app().service.socialService.acceptFriendInvite(owner, data.token)
    await captureMutation(owner, 'friend_invite_accepted')
    return null
  }),
  createFriendInvite: action(schemas.createFriendInvite, async (owner) => {
    const invite = await app().service.socialService.createFriendInvite(owner)
    await captureMutation(owner, 'friend_invite_created')
    return invite
  }),
  cancelFriendInvite: action(schemas.cancelFriendInvite, async (owner) => {
    await app().service.socialService.cancelFriendInvite(owner)
    await captureMutation(owner, 'friend_invite_cancelled')
    return null
  }),
  createLeague: action(schemas.createLeague, async (owner, data) => {
    const result = await app().service.sealedEventService.createTournament(owner, data)
    await captureSealedEventCreated(owner, data)
    return result
  }),
  joinLeague: action(schemas.joinLeague, async (owner, data) => {
    const status = await app().service.sealedEventService.joinSealedEvent(data.token, owner, data.eventToken)
    await captureMutation(owner, 'sealed_event_joined', { status })
    return status
  }),
  addLeagueEntrants: action(schemas.addLeagueEntrants, async (owner, data) => {
    const result = await app().service.sealedEventService.addSealedEventEntrants(data.token, owner, data.userIds, data.eventToken)
    await captureMutation(owner, 'sealed_event_entrants_added', { count: result.added })
    return result
  }),
  admitLeagueEntries: action(schemas.admitLeagueEntries, async (owner, data) => {
    const { admitted } = await app().service.sealedEventService.admitSealedEventEntries(data.token, owner, data.userIds, data.eventToken)
    await captureMutation(owner, 'sealed_event_entries_admitted', { count: admitted.length })
    return { admitted: admitted.length }
  }),
  moderateLeagueEntry: action(schemas.moderateLeagueEntry, async (owner, data) => {
    await app().service.sealedEventService.moderateSealedEventEntry(data.token, owner, data.userId, data.status, data.eventToken)
    await captureMutation(owner, 'sealed_event_entry_moderated', { status: data.status })
    return null
  }),
  submitLeagueRoster: action(schemas.submitLeagueRoster.partial({ capturedRoster: true, catalogueRevision: true }), async (owner, data) => {
    const { saved, snapshot } = await rosterForUse(owner, data.rosterId, { sealing: true })
    if (
      data.capturedRoster !== undefined &&
      (sealedContent(saveRosterSchema.parse(saved)) !== sealedContent(data.capturedRoster) ||
        (await app().catalogueFor(saved.catalogueId))?.index.revision !== data.catalogueRevision)
    )
      throw new Response('This roster or its army data changed after you chose to seal it. Review the saved action before sealing again.', {
        status: 409,
      })
    const result = await app().service.sealedEventService.submitSealedEventRoster(data.token, owner, saved, snapshot, data.eventToken)
    await captureMutation(owner, 'sealed_event_roster_submitted', {
      format: result.format,
      required_limit: result.requiredLimit,
    })
    return null
  }),
  setLeagueTeamDisposition: action(schemas.setLeagueTeamDisposition, async (owner, data) => {
    await app().service.sealedEventService.setSealedEventTeamDisposition(data.token, owner, data.disposition, data.eventToken)
    return null
  }),
  setLeagueTeamWarlord: action(schemas.setLeagueTeamWarlord, async (owner, data) => {
    await app().service.sealedEventService.setSealedEventTeamWarlord(data.token, owner, data.userId, data.eventToken)
    return null
  }),
  revealLeague: action(schemas.revealLeague, async (owner, data) => {
    await app().service.sealedEventService.revealSealedEvent(data.token, owner, data.eventToken)
    await captureMutation(owner, 'sealed_event_rosters_revealed')
    return null
  }),
  unsealLeagueRoster: action(schemas.unsealLeagueRoster, async (owner, data) => {
    await app().service.sealedEventService.unsealSealedEventRoster(data.token, owner, data.userId, data.eventToken)
    await captureMutation(owner, 'sealed_event_roster_unsealed')
    return null
  }),
  assignLeagueRosterRequirement: action(schemas.assignLeagueRosterRequirement, async (owner, data) => {
    const result = await app().service.sealedEventService.assignSealedEventRosterRequirement(
      data.token,
      owner,
      data.userId,
      data.requiredLimit,
      data.eventToken,
    )
    await captureMutation(owner, 'sealed_event_roster_requirement_assigned', { required_limit: result.requiredLimit })
    return null
  }),
  assignLeagueTeam: action(schemas.assignLeagueTeam, async (owner, data) => {
    const result = await app().service.sealedEventService.assignSealedEventTeam(data.token, owner, data.userIds, data.eventToken)
    await captureMutation(owner, 'sealed_event_team_assigned', { team_size: result.teamSize })
    return null
  }),
  chooseLeagueSide: action(schemas.chooseLeagueSide, async (owner, data) => {
    const result = await app().service.sealedEventService.chooseSealedEventSide(data.token, owner, data.side, data.eventToken)
    await captureMutation(owner, 'sealed_event_side_chosen', { side: result.side })
    return null
  }),
  updateLeague: action(schemas.updateLeague, async (owner, { token, rule, schedule, ...details }) => {
    const tournament = details.name === undefined ? undefined : (details as Required<typeof details>)
    const { ruleChanged } = await app().service.sealedEventService.updateSealedEvent(token, owner, { details: tournament, rule, schedule })
    if (tournament)
      await captureMutation(owner, 'tournament_updated', {
        visibility: tournament.visibility,
        admission: tournament.admission,
        player_limit_set: tournament.playerLimit !== null,
      })
    if (ruleChanged && rule)
      await captureMutation(owner, 'sealed_event_updated', {
        format: rule.format,
        roster_limit: rule.rosterLimit,
      })
    return null
  }),
  deleteLeague: action(schemas.deleteLeague, async (owner, data) => {
    await app().service.sealedEventService.deleteSealedEvent(data.token, owner)
    await captureMutation(owner, 'sealed_event_deleted')
    return null
  }),
  deleteBattle: action(schemas.deleteBattle, async (owner, data) => {
    const battleId = await app().service.deleteBattle(data.token, owner)
    await captureMutation(owner, 'battle_deleted', { battle_id: battleId })
    return null
  }),
  createBattle: action(schemas.createBattle, async (owner, data) => {
    const result = await app().service.createBattle(owner, data)
    await captureBattleCreated(owner, data, result)
    return result
  }),
  createLeagueBattle: action(schemas.createLeagueBattle, async (owner, data) => {
    const result = await app().service.sealedEventService.createSealedEventBattle(
      owner,
      data.token,
      data.opponentId,
      data.missionPackId,
      data.eventToken,
      data.allyId,
      data.secondOpponentId,
      withCurrentAlerts,
    )
    await captureSealedEventBattleCreated(owner, result)
    return { token: result.token }
  }),
} satisfies Record<OfflineActionKind, (owner: string, input: unknown) => Promise<unknown>>
