import type { z } from 'zod'
import { saveRosterSchema } from '../contracts/schemas'
import { offlineActionSchemas as schemas, type OfflineActionKind } from '../contracts/offlineActions'
import { app } from './app'
import { rosterForUse } from './rosterUsage'
import { captureMutation, captureBattleCreated, captureLeagueCreated, captureLeagueBattleCreated } from './mutationTelemetry'

const ONBOARDING_TASK_EVENTS = {
  complete: 'onboarding_task_completed',
  skip: 'onboarding_task_skipped',
  restore: 'onboarding_task_restored',
} as const

function action<S extends z.ZodType, R>(schema: S, work: (owner: string, data: z.output<S>) => Promise<R>) {
  return (owner: string, input: unknown) => work(owner, schema.parse(input))
}

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
    const progress = await app().service.updateOnboardingProgress(owner, data)
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
    const result = await app().service.leagueService.createLeague(owner, data)
    await captureLeagueCreated(owner, data)
    return result
  }),
  createLeagueEvent: action(schemas.createLeagueEvent, async (owner, data) => {
    const { token, ...input } = data
    const result = await app().service.leagueService.createLeagueEvent(token, owner, input)
    await captureMutation(owner, 'league_event_created', {
      format: data.format,
      roster_limit: data.rosterLimit,
      owner_plays: data.ownerPlays,
    })
    return result
  }),
  joinLeague: action(schemas.joinLeague, async (owner, data) => {
    const status = await app().service.leagueService.joinLeague(data.token, owner, data.eventToken)
    await captureMutation(owner, 'league_joined', { status })
    return status
  }),
  addLeagueEntrants: action(schemas.addLeagueEntrants, async (owner, data) => {
    const result = await app().service.leagueService.addLeagueEntrants(data.token, owner, data.userIds, data.eventToken)
    await captureMutation(owner, 'league_entrants_added', { count: result.added })
    return result
  }),
  admitLeagueEntries: action(schemas.admitLeagueEntries, async (owner, data) => {
    const { admitted } = await app().service.leagueService.admitLeagueEntries(data.token, owner, data.userIds, data.eventToken)
    await captureMutation(owner, 'league_entries_admitted', { count: admitted.length })
    return { admitted: admitted.length }
  }),
  moderateLeagueEntry: action(schemas.moderateLeagueEntry, async (owner, data) => {
    await app().service.leagueService.moderateLeagueEntry(data.token, owner, data.userId, data.status, data.eventToken)
    await captureMutation(owner, 'league_entry_moderated', { status: data.status })
    return null
  }),
  submitLeagueRoster: action(schemas.submitLeagueRoster.partial({ capturedRoster: true, catalogueRevision: true }), async (owner, data) => {
    const { saved, snapshot } = await rosterForUse(owner, data.rosterId)
    if (
      data.capturedRoster !== undefined &&
      (JSON.stringify(saveRosterSchema.parse(saved)) !== JSON.stringify(data.capturedRoster) ||
        (await app().catalogueFor(saved.catalogueId))?.index.revision !== data.catalogueRevision)
    )
      throw new Response('This roster or its army data changed after you chose to seal it. Review the saved action before sealing again.', {
        status: 409,
      })
    const result = await app().service.leagueService.submitLeagueRoster(data.token, owner, saved, snapshot, data.eventToken)
    await captureMutation(owner, 'league_roster_submitted', {
      format: result.format,
      required_limit: result.requiredLimit,
    })
    return null
  }),
  setLeagueTeamDisposition: action(schemas.setLeagueTeamDisposition, async (owner, data) => {
    await app().service.leagueService.setLeagueTeamDisposition(data.token, owner, data.disposition, data.eventToken)
    return null
  }),
  revealLeague: action(schemas.revealLeague, async (owner, data) => {
    await app().service.leagueService.revealLeague(data.token, owner, data.eventToken)
    await captureMutation(owner, 'league_rosters_revealed')
    return null
  }),
  unsealLeagueRoster: action(schemas.unsealLeagueRoster, async (owner, data) => {
    await app().service.leagueService.unsealLeagueRoster(data.token, owner, data.userId, data.eventToken)
    await captureMutation(owner, 'league_roster_unsealed')
    return null
  }),
  assignLeagueRosterRequirement: action(schemas.assignLeagueRosterRequirement, async (owner, data) => {
    const result = await app().service.leagueService.assignLeagueRosterRequirement(
      data.token,
      owner,
      data.userId,
      data.requiredLimit,
      data.eventToken,
    )
    await captureMutation(owner, 'league_roster_requirement_assigned', { required_limit: result.requiredLimit })
    return null
  }),
  assignLeagueTeam: action(schemas.assignLeagueTeam, async (owner, data) => {
    const result = await app().service.leagueService.assignLeagueTeam(data.token, owner, data.userIds, data.eventToken)
    await captureMutation(owner, 'league_team_assigned', { team_size: result.teamSize })
    return null
  }),
  updateLeague: action(schemas.updateLeague, async (owner, data) => {
    const { token, ...input } = data
    const { ruleChanged } = await app().service.leagueService.updateLeague(token, owner, input)
    await captureMutation(owner, 'league_updated', {
      visibility: input.visibility,
      admission: input.admission,
      player_limit_set: input.playerLimit !== null,
    })
    if (ruleChanged && input.rule)
      await captureMutation(owner, 'league_event_updated', {
        format: input.rule.format,
        roster_limit: input.rule.rosterLimit,
      })
    return null
  }),
  deleteLeague: action(schemas.deleteLeague, async (owner, data) => {
    await app().service.leagueService.deleteLeague(data.token, owner)
    await captureMutation(owner, 'league_deleted')
    return null
  }),
  deleteBattle: action(schemas.deleteBattle, async (owner, data) => {
    await app().service.deleteBattle(data.token, owner)
    await captureMutation(owner, 'battle_deleted')
    return null
  }),
  createBattle: action(schemas.createBattle, async (owner, data) => {
    const result = await app().service.createBattle(owner, data)
    await captureBattleCreated(owner, data, result)
    return result
  }),
  createLeagueBattle: action(schemas.createLeagueBattle, async (owner, data) => {
    const result = await app().service.leagueService.createLeagueBattle(
      owner,
      data.token,
      data.opponentId,
      data.missionPackId,
      data.eventToken,
      data.allyId,
      data.secondOpponentId,
    )
    await captureLeagueBattleCreated(owner, result)
    return { token: result.token }
  }),
} satisfies Record<OfflineActionKind, (owner: string, input: unknown) => Promise<unknown>>
