import { saveRosterSchema } from '../contracts/schemas'
import type { z } from 'zod'
import { offlineActionSchemas as schemas, type OfflineActionKind } from '../contracts/offlineActions'
import { app } from './app'
import { rosterForUse } from './rosterUsage'

function action<S extends z.ZodType>(schema: S, work: (owner: string, data: z.output<S>) => Promise<unknown>) {
  return (owner: string, input: unknown) => work(owner, schema.parse(input))
}
const service = () => app().service
export const offlineActions: Record<OfflineActionKind, (owner: string, input: unknown) => Promise<unknown>> = {
  setOwned: action(schemas.setOwned, (owner, data) => service().setOwned(owner, data.entryId, data.owned)),
  setFavouriteFaction: action(schemas.setFavouriteFaction, (owner, data) =>
    service().setFavouriteFaction(owner, data.catalogueId, data.favourite),
  ),
  setFavouriteDetachment: action(schemas.setFavouriteDetachment, (owner, data) =>
    service().setFavouriteDetachment(owner, data.catalogueId, data.detachmentId, data.favourite),
  ),
  setPlayerDefaults: action(schemas.setPlayerDefaults, (owner, data) => service().setPlayerDefaults(owner, data)),
  setBattleAudience: action(schemas.setBattleAudience, (owner, data) => service().setBattleAudience(owner, data.audience)),
  setPushNotifications: action(schemas.setPushNotifications, (owner, data) => service().setPushEnabled(owner, data.enabled)),
  updateOnboardingProgress: action(schemas.updateOnboardingProgress, (owner, data) => service().updateOnboardingProgress(owner, data)),
  requestFriend: action(schemas.requestFriend, (owner, data) => service().requestFriend(owner, data.userId)),
  acceptFriend: action(schemas.acceptFriend, (owner, data) => service().acceptFriend(owner, data.userId)),
  rejectFriend: action(schemas.rejectFriend, (owner, data) => service().rejectFriend(owner, data.userId)),
  removeFriend: action(schemas.removeFriend, (owner, data) => service().removeFriend(owner, data.userId)),
  acceptFriendInvite: action(schemas.acceptFriendInvite, (owner, data) => service().acceptFriendInvite(owner, data.token)),
  createFriendInvite: action(schemas.createFriendInvite, (owner) => service().createFriendInvite(owner)),
  cancelFriendInvite: action(schemas.cancelFriendInvite, (owner) => service().cancelFriendInvite(owner)),
  createLeague: action(schemas.createLeague, (owner, data) => service().createLeague(owner, data)),
  createLeagueEvent: action(schemas.createLeagueEvent, (owner, data) => {
    const { token, ...input } = data
    return service().createLeagueEvent(token, owner, input)
  }),
  joinLeague: action(schemas.joinLeague, (owner, data) => service().joinLeague(data.token, owner, data.eventToken)),
  addLeagueEntrants: action(schemas.addLeagueEntrants, (owner, data) =>
    service().addLeagueEntrants(data.token, owner, data.userIds, data.eventToken),
  ),
  admitLeagueEntries: action(schemas.admitLeagueEntries, (owner, data) =>
    service().admitLeagueEntries(data.token, owner, data.userIds, data.eventToken),
  ),
  moderateLeagueEntry: action(schemas.moderateLeagueEntry, (owner, data) =>
    service().moderateLeagueEntry(data.token, owner, data.userId, data.status, data.eventToken),
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
    return service().submitLeagueRoster(data.token, owner, saved, snapshot, data.eventToken)
  }),
  revealLeague: action(schemas.revealLeague, (owner, data) => service().revealLeague(data.token, owner, data.eventToken)),
  unsealLeagueRoster: action(schemas.unsealLeagueRoster, (owner, data) =>
    service().unsealLeagueRoster(data.token, owner, data.userId, data.eventToken),
  ),
  assignLeagueRosterRequirement: action(schemas.assignLeagueRosterRequirement, (owner, data) =>
    service().assignLeagueRosterRequirement(data.token, owner, data.userId, data.requiredLimit, data.eventToken),
  ),
  assignLeagueTeam: action(schemas.assignLeagueTeam, (owner, data) =>
    service().assignLeagueTeam(data.token, owner, data.userIds, data.eventToken),
  ),
  updateLeague: action(schemas.updateLeague, (owner, data) => {
    const { token, ...input } = data
    return service().updateLeague(token, owner, input)
  }),
  deleteLeague: action(schemas.deleteLeague, (owner, data) => service().deleteLeague(data.token, owner)),
  deleteBattle: action(schemas.deleteBattle, (owner, data) => service().deleteBattle(data.token, owner)),
  createBattle: action(schemas.createBattle, (owner, data) => service().createBattle(owner, data)),
  createLeagueBattle: action(schemas.createLeagueBattle, (owner, data) =>
    service().createLeagueBattle(
      owner,
      data.token,
      data.opponentId,
      data.missionPackId,
      data.eventToken,
      data.allyId,
      data.secondOpponentId,
    ),
  ),
}
