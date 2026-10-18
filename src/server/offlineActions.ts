import { saveRosterSchema } from '../contracts/schemas'
import type { z } from 'zod'
import { offlineActionSchemas as schemas, type OfflineActionKind } from '../contracts/offlineActions'
import { app } from './app'
import { rosterForUse } from './rosterUsage'
import { captureBattleCreated, captureLeagueCreated, captureLeagueBattleCreated } from './creationTelemetry'

function action<S extends z.ZodType>(schema: S, work: (owner: string, data: z.output<S>) => Promise<unknown>) {
  return (owner: string, input: unknown) => work(owner, schema.parse(input))
}
const service = () => app().service
export const offlineActions: Record<OfflineActionKind, (owner: string, input: unknown) => Promise<unknown>> = {
  setOwned: action(schemas.setOwned, (owner, data) => service().rosterService.setOwned(owner, data.entryId, data.owned)),
  setCollectionModels: action(schemas.setCollectionModels, (owner, data) =>
    service().rosterService.setCollectionModels(owner, data.entryId, data.models),
  ),
  setCollectionProgress: action(schemas.setCollectionProgress, (owner, data) =>
    service().rosterService.setCollectionProgress(owner, data.entryId, { built: data.built, painted: data.painted }),
  ),
  setCollectionWanted: action(schemas.setCollectionWanted, (owner, data) =>
    service().rosterService.setCollectionWanted(owner, data.entryId, data.wanted),
  ),
  setFavouriteFaction: action(schemas.setFavouriteFaction, (owner, data) =>
    service().rosterService.setFavouriteFaction(owner, data.catalogueId, data.favourite),
  ),
  setFavouriteDetachment: action(schemas.setFavouriteDetachment, (owner, data) =>
    service().rosterService.setFavouriteDetachment(owner, data.catalogueId, data.detachmentId, data.favourite),
  ),
  setFavouriteDatasheet: action(schemas.setFavouriteDatasheet, (owner, data) =>
    service().rosterService.setFavouriteDatasheet(owner, data.entryId, data.favourite),
  ),
  setPlayerDefaults: action(schemas.setPlayerDefaults, (owner, data) => service().setPlayerDefaults(owner, data)),
  setBattleAudience: action(schemas.setBattleAudience, (owner, data) => service().setBattleAudience(owner, data.audience)),
  setPushNotifications: action(schemas.setPushNotifications, (owner, data) => service().setPushEnabled(owner, data.enabled)),
  updateOnboardingProgress: action(schemas.updateOnboardingProgress, (owner, data) => service().updateOnboardingProgress(owner, data)),
  requestFriend: action(schemas.requestFriend, (owner, data) => service().socialService.requestFriend(owner, data.userId)),
  acceptFriend: action(schemas.acceptFriend, (owner, data) => service().socialService.acceptFriend(owner, data.userId)),
  rejectFriend: action(schemas.rejectFriend, (owner, data) => service().socialService.rejectFriend(owner, data.userId)),
  removeFriend: action(schemas.removeFriend, (owner, data) => service().socialService.removeFriend(owner, data.userId)),
  acceptFriendInvite: action(schemas.acceptFriendInvite, (owner, data) => service().socialService.acceptFriendInvite(owner, data.token)),
  createFriendInvite: action(schemas.createFriendInvite, (owner) => service().socialService.createFriendInvite(owner)),
  cancelFriendInvite: action(schemas.cancelFriendInvite, (owner) => service().socialService.cancelFriendInvite(owner)),
  createLeague: action(schemas.createLeague, async (owner, data) => {
    const result = await service().leagueService.createLeague(owner, data)
    await captureLeagueCreated(owner, data)
    return result
  }),
  createLeagueEvent: action(schemas.createLeagueEvent, (owner, data) => {
    const { token, ...input } = data
    return service().leagueService.createLeagueEvent(token, owner, input)
  }),
  joinLeague: action(schemas.joinLeague, (owner, data) => service().leagueService.joinLeague(data.token, owner, data.eventToken)),
  addLeagueEntrants: action(schemas.addLeagueEntrants, (owner, data) =>
    service().leagueService.addLeagueEntrants(data.token, owner, data.userIds, data.eventToken),
  ),
  admitLeagueEntries: action(schemas.admitLeagueEntries, (owner, data) =>
    service().leagueService.admitLeagueEntries(data.token, owner, data.userIds, data.eventToken),
  ),
  moderateLeagueEntry: action(schemas.moderateLeagueEntry, (owner, data) =>
    service().leagueService.moderateLeagueEntry(data.token, owner, data.userId, data.status, data.eventToken),
  ),
  submitLeagueRoster: action(schemas.submitLeagueRoster, async (owner, data) => {
    const { saved, snapshot } = await rosterForUse(owner, data.rosterId)
    if (
      JSON.stringify(saveRosterSchema.parse(saved)) !== JSON.stringify(data.capturedRoster) ||
      (await app().catalogueFor(saved.catalogueId))?.index.revision !== data.catalogueRevision
    )
      throw new Response('This roster or its army data changed after you chose to seal it. Review the saved action before sealing again.', {
        status: 409,
      })
    return service().leagueService.submitLeagueRoster(data.token, owner, saved, snapshot, data.eventToken)
  }),
  setLeagueTeamDisposition: action(schemas.setLeagueTeamDisposition, (owner, data) =>
    service().leagueService.setLeagueTeamDisposition(data.token, owner, data.disposition, data.eventToken),
  ),
  revealLeague: action(schemas.revealLeague, (owner, data) => service().leagueService.revealLeague(data.token, owner, data.eventToken)),
  unsealLeagueRoster: action(schemas.unsealLeagueRoster, (owner, data) =>
    service().leagueService.unsealLeagueRoster(data.token, owner, data.userId, data.eventToken),
  ),
  assignLeagueRosterRequirement: action(schemas.assignLeagueRosterRequirement, (owner, data) =>
    service().leagueService.assignLeagueRosterRequirement(data.token, owner, data.userId, data.requiredLimit, data.eventToken),
  ),
  assignLeagueTeam: action(schemas.assignLeagueTeam, (owner, data) =>
    service().leagueService.assignLeagueTeam(data.token, owner, data.userIds, data.eventToken),
  ),
  updateLeague: action(schemas.updateLeague, (owner, data) => {
    const { token, ...input } = data
    return service().leagueService.updateLeague(token, owner, input)
  }),
  deleteLeague: action(schemas.deleteLeague, (owner, data) => service().leagueService.deleteLeague(data.token, owner)),
  deleteBattle: action(schemas.deleteBattle, (owner, data) => service().deleteBattle(data.token, owner)),
  createBattle: action(schemas.createBattle, async (owner, data) => {
    const result = await service().createBattle(owner, data)
    await captureBattleCreated(owner, data, result)
    return result
  }),
  createLeagueBattle: action(schemas.createLeagueBattle, async (owner, data) => {
    const result = await service().leagueService.createLeagueBattle(
      owner,
      data.token,
      data.opponentId,
      data.missionPackId,
      data.eventToken,
      data.allyId,
      data.secondOpponentId,
    )
    await captureLeagueBattleCreated(owner, result)
    return result
  }),
}
